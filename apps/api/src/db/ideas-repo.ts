import { edgeId, type IdeaDTO } from '@nodo/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { edges, ideas, nodes, people } from './schema.js';
import { toIdeaDTO, toPersonRef } from '../domain/mappers.js';

const selectIdea = (db: Db) =>
  db
    .select({
      id: ideas.id,
      title: ideas.title,
      summary: ideas.summary,
      authorId: ideas.authorId,
      createdAt: ideas.createdAt,
    })
    .from(ideas);

export const loadIdeaDTO = async (db: Db, ideaId: string): Promise<IdeaDTO | undefined> => {
  const [row] = await selectIdea(db).where(eq(ideas.id, ideaId));
  if (!row) return undefined;

  const [author] = await db
    .select({ id: people.id, handle: people.handle, displayName: people.displayName })
    .from(people)
    .where(eq(people.id, row.authorId));
  if (!author) return undefined;

  const [spawned] = await db
    .select({ toId: edges.toId })
    .from(edges)
    .where(and(eq(edges.kind, 'spawned'), eq(edges.fromId, ideaId)));

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(edges)
    .where(and(eq(edges.kind, 'interested_in'), eq(edges.toId, ideaId)));

  return toIdeaDTO(row, toPersonRef(author), spawned?.toId ?? null, countRow?.count ?? 0);
};

export const listIdeas = async (db: Db): Promise<IdeaDTO[]> => {
  const rows = await selectIdea(db);
  const dtos = await Promise.all(rows.map((r) => loadIdeaDTO(db, r.id)));
  return dtos.filter((d): d is IdeaDTO => d !== undefined);
};

export const createIdea = async (
  db: Db,
  input: { id: string; title: string; summary: string | null; authorId: string },
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.insert(nodes).values({ id: input.id, kind: 'idea', label: input.title, meta: {} });
    await tx.insert(ideas).values({
      id: input.id,
      title: input.title,
      summary: input.summary,
      authorId: input.authorId,
    });
    await tx.insert(edges).values({
      id: edgeId('authored', input.authorId, input.id),
      kind: 'authored',
      fromId: input.authorId,
      toId: input.id,
    });
  });
};

/** Toggle de `INTERESTED_IN`. Devuelve el nuevo estado (`true` = interesado). */
export const toggleInterest = async (db: Db, personId: string, ideaId: string): Promise<boolean> => {
  const id = edgeId('interested_in', personId, ideaId);
  const [existing] = await db.select({ id: edges.id }).from(edges).where(eq(edges.id, id));

  if (existing) {
    await db.delete(edges).where(eq(edges.id, id));
    return false;
  }

  await db.insert(edges).values({ id, kind: 'interested_in', fromId: personId, toId: ideaId });
  return true;
};
