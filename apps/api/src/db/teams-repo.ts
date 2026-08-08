import { edgeId, type NeedRef, type PersonRef, type TeamDTO, type TeamStatus } from '@nodo/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { edges, nodes, people, teams } from './schema.js';
import { deriveTeamStatus } from '../domain/state.js';
import { toNeedRef, toPersonRef, toTeamDTO, type TeamRow } from '../domain/mappers.js';

const selectTeam = (db: Db) =>
  db
    .select({
      id: teams.id,
      name: teams.name,
      pitch: teams.pitch,
      leadId: teams.leadId,
      ideaId: teams.ideaId,
      maxSize: teams.maxSize,
      frozen: teams.frozen,
      createdAt: teams.createdAt,
    })
    .from(teams);

export const findTeamRow = async (
  db: Db,
  id: string,
): Promise<(TeamRow & { leadId: string; frozen: boolean }) | undefined> => {
  const [row] = await selectTeam(db).where(eq(teams.id, id));
  return row;
};

export const getTeamMembers = async (db: Db, teamId: string): Promise<PersonRef[]> => {
  const rows = await db
    .select({ id: people.id, handle: people.handle, displayName: people.displayName })
    .from(edges)
    .innerJoin(people, eq(people.id, edges.fromId))
    .where(and(eq(edges.kind, 'member_of'), eq(edges.toId, teamId)));
  return rows.map(toPersonRef);
};

export const getTeamNeeds = async (db: Db, teamId: string): Promise<NeedRef[]> => {
  const rows = await db
    .select({ slug: nodes.id, label: nodes.label, meta: edges.meta })
    .from(edges)
    .innerJoin(nodes, eq(nodes.id, edges.toId))
    .where(and(eq(edges.kind, 'needs'), eq(edges.fromId, teamId)));
  return rows.map((r) =>
    toNeedRef(
      { slug: r.slug, label: r.label, category: (r as any).category ?? 'other' },
      ((r.meta as any)?.priority ?? 'nice') as 'required' | 'nice',
    ),
  );
};

export const getPersonRef = async (db: Db, personId: string): Promise<PersonRef | undefined> => {
  const [row] = await db
    .select({ id: people.id, handle: people.handle, displayName: people.displayName })
    .from(people)
    .where(eq(people.id, personId));
  return row ? toPersonRef(row) : undefined;
};

export const deriveAndPersistTeamStatus = async (
  db: Db,
  teamId: string,
  frozen: boolean,
): Promise<TeamStatus> => {
  const members = await getTeamMembers(db, teamId);
  const [row] = await selectTeam(db).where(eq(teams.id, teamId));
  const status = deriveTeamStatus({ frozen, memberCount: members.length, maxSize: row?.maxSize ?? 4 });
  await db.update(nodes).set({ status, updatedAt: sql`now()` }).where(eq(nodes.id, teamId));
  return status;
};

export const loadTeamDTO = async (db: Db, teamId: string): Promise<TeamDTO | undefined> => {
  const row = await findTeamRow(db, teamId);
  if (!row) return undefined;
  const lead = await getPersonRef(db, row.leadId);
  if (!lead) return undefined;
  const members = await getTeamMembers(db, teamId);
  const needs = await getTeamNeeds(db, teamId);
  const status = deriveTeamStatus({ frozen: row.frozen, memberCount: members.length, maxSize: row.maxSize });
  return toTeamDTO(row, status, lead, members, needs);
};

export type CreateTeamInput = {
  id: string;
  name: string;
  pitch: string | null;
  leadId: string;
  ideaId: string | null;
  maxSize: number;
  needs: NeedRef[];
};

/**
 * Invariante 3: `LEADS` y `MEMBER_OF` se insertan en la misma transacción.
 * El líder cuenta como el primer miembro.
 */
export const createTeam = async (db: Db, input: CreateTeamInput): Promise<void> => {
  await db.transaction(async (tx) => {
    const status = deriveTeamStatus({ frozen: false, memberCount: 1, maxSize: input.maxSize });

    await tx.insert(nodes).values({
      id: input.id,
      kind: 'team',
      label: input.name,
      status,
      meta: { maxSize: input.maxSize },
    });
    await tx.insert(teams).values({
      id: input.id,
      name: input.name,
      pitch: input.pitch,
      leadId: input.leadId,
      ideaId: input.ideaId,
      maxSize: input.maxSize,
    });
    await tx.insert(edges).values({
      id: edgeId('leads', input.leadId, input.id),
      kind: 'leads',
      fromId: input.leadId,
      toId: input.id,
    });
    await tx.insert(edges).values({
      id: edgeId('member_of', input.leadId, input.id),
      kind: 'member_of',
      fromId: input.leadId,
      toId: input.id,
    });
    for (const need of input.needs) {
      await tx.insert(edges).values({
        id: edgeId('needs', input.id, need.slug),
        kind: 'needs',
        fromId: input.id,
        toId: need.slug,
        weight: need.priority === 'required' ? 2 : 1,
        meta: { priority: need.priority },
      });
    }
    if (input.ideaId) {
      await tx.insert(edges).values({
        id: edgeId('spawned', input.ideaId, input.id),
        kind: 'spawned',
        fromId: input.ideaId,
        toId: input.id,
      });
    }
  });
};

export type UpdateTeamInput = Partial<{ name: string; pitch: string | null; frozen: boolean }>;

export const updateTeam = async (db: Db, teamId: string, patch: UpdateTeamInput): Promise<void> => {
  await db.transaction(async (tx) => {
    if (Object.keys(patch).length > 0) {
      await tx.update(teams).set(patch).where(eq(teams.id, teamId));
      if (patch.name) await tx.update(nodes).set({ label: patch.name }).where(eq(nodes.id, teamId));
    }
  });
};

/** Reemplaza el conjunto completo de needs (no es un parche). Devuelve los slugs quitados. */
export const replaceNeeds = async (db: Db, teamId: string, needs: NeedRef[]): Promise<string[]> => {
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ toId: edges.toId })
      .from(edges)
      .where(and(eq(edges.kind, 'needs'), eq(edges.fromId, teamId)));
    const removed = current.map((c) => c.toId);

    await tx.delete(edges).where(and(eq(edges.kind, 'needs'), eq(edges.fromId, teamId)));
    for (const need of needs) {
      await tx.insert(edges).values({
        id: edgeId('needs', teamId, need.slug),
        kind: 'needs',
        fromId: teamId,
        toId: need.slug,
        weight: need.priority === 'required' ? 2 : 1,
        meta: { priority: need.priority },
      });
    }
    return removed;
  });
};

export const addMember = async (db: Db, teamId: string, personId: string): Promise<void> => {
  await db.insert(edges).values({
    id: edgeId('member_of', personId, teamId),
    kind: 'member_of',
    fromId: personId,
    toId: teamId,
  });
};

export const removeMember = async (db: Db, teamId: string, personId: string): Promise<void> => {
  await db
    .delete(edges)
    .where(and(eq(edges.kind, 'member_of'), eq(edges.fromId, personId), eq(edges.toId, teamId)));
};

export const listTeams = async (db: Db, status?: TeamStatus): Promise<TeamDTO[]> => {
  const rows = await selectTeam(db);
  const dtos: TeamDTO[] = [];
  for (const row of rows) {
    const dto = await loadTeamDTO(db, row.id);
    if (dto && (!status || dto.status === status)) dtos.push(dto);
  }
  return dtos;
};
