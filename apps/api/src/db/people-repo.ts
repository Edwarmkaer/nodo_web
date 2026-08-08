import { edgeId, type PersonDTO, type PersonStatus, type SkillRef } from '@nodo/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { edges, nodes, people } from './schema.js';
import { toPersonDTO, toSkillRef, type PersonRow } from '../domain/mappers.js';

export type PersonRecord = PersonRow & { status: PersonStatus; sessionToken: string; recoveryCode: string };

const selectPerson = (db: Db) =>
  db
    .select({
      id: people.id,
      handle: people.handle,
      displayName: people.displayName,
      headline: people.headline,
      bioRaw: people.bioRaw,
      availability: people.availability,
      language: people.language,
      createdAt: people.createdAt,
      sessionToken: people.sessionToken,
      recoveryCode: people.recoveryCode,
      status: nodes.status,
    })
    .from(people)
    .innerJoin(nodes, eq(nodes.id, people.id));

export const findPersonById = async (db: Db, id: string): Promise<PersonRecord | undefined> => {
  const [row] = await selectPerson(db).where(eq(people.id, id));
  return row ? { ...row, status: (row.status ?? 'looking') as PersonStatus } : undefined;
};

export const findPersonBySessionToken = async (
  db: Db,
  token: string,
): Promise<PersonRecord | undefined> => {
  const [row] = await selectPerson(db).where(eq(people.sessionToken, token));
  return row ? { ...row, status: (row.status ?? 'looking') as PersonStatus } : undefined;
};

export const findPersonByRecoveryCode = async (
  db: Db,
  recoveryCode: string,
): Promise<PersonRecord | undefined> => {
  const [row] = await selectPerson(db).where(eq(people.recoveryCode, recoveryCode));
  return row ? { ...row, status: (row.status ?? 'looking') as PersonStatus } : undefined;
};

export const handleExists = async (db: Db, handle: string): Promise<boolean> => {
  const [row] = await db.select({ id: people.id }).from(people).where(eq(people.handle, handle));
  return row !== undefined;
};

/** `MEMBER_OF` materializado. Como máximo uno (invariante 1). */
export const getPersonTeamId = async (db: Db, personId: string): Promise<string | null> => {
  const [row] = await db
    .select({ toId: edges.toId })
    .from(edges)
    .where(and(eq(edges.kind, 'member_of'), eq(edges.fromId, personId)));
  return row?.toId ?? null;
};

export const getPersonSkills = async (db: Db, personId: string): Promise<SkillRef[]> => {
  const rows = await db
    .select({ id: nodes.id, label: nodes.label, meta: nodes.meta })
    .from(edges)
    .innerJoin(nodes, eq(nodes.id, edges.toId))
    .where(and(eq(edges.kind, 'has_skill'), eq(edges.fromId, personId)));

  return rows.map((r) => toSkillRef({ slug: r.id, label: r.label, category: (r.meta as any)?.category ?? 'other' }));
};

export const loadPersonDTO = async (db: Db, personId: string): Promise<PersonDTO | undefined> => {
  const row = await findPersonById(db, personId);
  if (!row) return undefined;
  const teamId = await getPersonTeamId(db, personId);
  return toPersonDTO(row, row.status, teamId);
};

export type CreatePersonInput = {
  id: string;
  handle: string;
  displayName: string;
  headline: string | null;
  bioRaw: string | null;
  availability: 'full' | 'partial' | 'evenings';
  language: string;
  sessionToken: string;
  recoveryCode: string;
  skills: SkillRef[];
};

/** Crea nodo + detalle + aristas `has_skill` en una sola transacción. */
export const createPerson = async (db: Db, input: CreatePersonInput): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.insert(nodes).values({
      id: input.id,
      kind: 'person',
      label: input.displayName,
      status: 'looking',
      meta: { handle: input.handle },
    });
    await tx.insert(people).values({
      id: input.id,
      handle: input.handle,
      displayName: input.displayName,
      headline: input.headline,
      bioRaw: input.bioRaw,
      availability: input.availability,
      language: input.language,
      sessionToken: input.sessionToken,
      recoveryCode: input.recoveryCode,
    });
    for (const skill of input.skills) {
      await tx.insert(edges).values({
        id: edgeId('has_skill', input.id, skill.slug),
        kind: 'has_skill',
        fromId: input.id,
        toId: skill.slug,
      });
    }
  });
};

export type UpdatePersonInput = Partial<{
  displayName: string;
  headline: string | null;
  bioRaw: string | null;
  availability: 'full' | 'partial' | 'evenings';
  language: string;
}>;

/**
 * Actualiza el detalle y reemplaza el conjunto de skills si `skills` viene
 * definido. Devuelve los slugs añadidos y quitados, para el `GraphPatch`.
 */
export const updatePerson = async (
  db: Db,
  personId: string,
  patch: UpdatePersonInput,
  newSkills?: SkillRef[],
): Promise<{ added: SkillRef[]; removed: string[] }> => {
  return db.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx.update(people).set(patch).where(eq(people.id, personId));
      if (patch.displayName) {
        await tx.update(nodes).set({ label: patch.displayName, updatedAt: sql`now()` }).where(eq(nodes.id, personId));
      }
    }

    let added: SkillRef[] = [];
    let removed: string[] = [];

    if (newSkills) {
      const current = await tx
        .select({ toId: edges.toId })
        .from(edges)
        .where(and(eq(edges.kind, 'has_skill'), eq(edges.fromId, personId)));
      const currentSlugs = new Set(current.map((c) => c.toId));
      const nextSlugs = new Set(newSkills.map((s) => s.slug));

      removed = [...currentSlugs].filter((slug) => !nextSlugs.has(slug));
      added = newSkills.filter((s) => !currentSlugs.has(s.slug));

      for (const slug of removed) {
        await tx
          .delete(edges)
          .where(and(eq(edges.kind, 'has_skill'), eq(edges.fromId, personId), eq(edges.toId, slug)));
      }
      for (const skill of added) {
        await tx.insert(edges).values({
          id: edgeId('has_skill', personId, skill.slug),
          kind: 'has_skill',
          fromId: personId,
          toId: skill.slug,
        });
      }
    }

    return { added, removed };
  });
};

export const setPersonStatus = async (db: Db, personId: string, status: PersonStatus): Promise<void> => {
  await db.update(nodes).set({ status, updatedAt: sql`now()` }).where(eq(nodes.id, personId));
};
