import { edgeId, type ApplicationDTO, type ApplicationStatus } from '@nodo/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { edges, people, suggestions, teams } from './schema.js';
import { toApplicationDTO, toPersonRef } from '../domain/mappers.js';

/**
 * `Application` no tiene tabla propia: es la arista `applied_to` (docs/02).
 * Sus campos de dominio —`status`, `message`, `resolvedAt`— viven en
 * `edges.meta`, porque `edges` no tiene columna `updated_at`.
 */
type AppliedToRow = {
  id: string;
  fromId: string;
  toId: string;
  meta: unknown;
  createdAt: Date;
};

const metaOf = (row: AppliedToRow) => row.meta as {
  status: ApplicationStatus;
  message: string | null;
  resolvedAt: number | null;
};

const toDTO = async (db: Db, row: AppliedToRow): Promise<ApplicationDTO | undefined> => {
  const [person] = await db
    .select({ id: people.id, handle: people.handle, displayName: people.displayName })
    .from(people)
    .where(eq(people.id, row.fromId));
  const [team] = await db
    .select({ name: teams.name, leadId: teams.leadId })
    .from(teams)
    .where(eq(teams.id, row.toId));
  if (!person || !team) return undefined;

  const meta = metaOf(row);
  return toApplicationDTO({
    id: row.id,
    person: toPersonRef(person),
    teamId: row.toId,
    teamName: team.name,
    leadId: team.leadId,
    status: meta.status,
    message: meta.message,
    createdAt: row.createdAt,
    resolvedAt: meta.resolvedAt,
  });
};

export const findApplicationById = async (db: Db, id: string): Promise<ApplicationDTO | undefined> => {
  const [row] = await db
    .select({ id: edges.id, fromId: edges.fromId, toId: edges.toId, meta: edges.meta, createdAt: edges.createdAt })
    .from(edges)
    .where(and(eq(edges.kind, 'applied_to'), eq(edges.id, id)));
  if (!row) return undefined;
  return toDTO(db, row);
};

export const findPendingApplication = async (
  db: Db,
  personId: string,
  teamId: string,
): Promise<ApplicationDTO | undefined> => {
  const rows = await db
    .select({ id: edges.id, fromId: edges.fromId, toId: edges.toId, meta: edges.meta, createdAt: edges.createdAt })
    .from(edges)
    .where(and(eq(edges.kind, 'applied_to'), eq(edges.fromId, personId), eq(edges.toId, teamId)));
  const pending = rows.find((r) => metaOf(r).status === 'pending');
  return pending ? toDTO(db, pending) : undefined;
};

export const listApplicationsForTeam = async (db: Db, teamId: string): Promise<ApplicationDTO[]> => {
  const rows = await db
    .select({ id: edges.id, fromId: edges.fromId, toId: edges.toId, meta: edges.meta, createdAt: edges.createdAt })
    .from(edges)
    .where(and(eq(edges.kind, 'applied_to'), eq(edges.toId, teamId)));
  const dtos = await Promise.all(rows.map((r) => toDTO(db, r)));
  return dtos.filter((d): d is ApplicationDTO => d !== undefined);
};

/** Para el claim `teams` del JWT de Portal: equipos donde la persona tiene una solicitud `pending`. */
export const listPendingApplicationTeamIds = async (db: Db, personId: string): Promise<string[]> => {
  const rows = await db
    .select({ toId: edges.toId, meta: edges.meta })
    .from(edges)
    .where(and(eq(edges.kind, 'applied_to'), eq(edges.fromId, personId)));
  return rows.filter((r) => (r.meta as any)?.status === 'pending').map((r) => r.toId);
};

export const createApplication = async (
  db: Db,
  input: { id: string; personId: string; teamId: string; message: string | null },
): Promise<void> => {
  await db.insert(edges).values({
    id: input.id,
    kind: 'applied_to',
    fromId: input.personId,
    toId: input.teamId,
    meta: { status: 'pending', message: input.message, resolvedAt: null },
  });
};

export const withdrawApplication = async (db: Db, id: string): Promise<void> => {
  await db
    .update(edges)
    .set({ meta: sqlMerge({ status: 'withdrawn', resolvedAt: Date.now() }) })
    .where(eq(edges.id, id));
};

/**
 * Invariante 5, completo: `MEMBER_OF` + `person.status = teamed` +
 * recalcular `team.status` + `auto_reject` de las demás pendientes de esa
 * persona + invalidar sus sugerencias vivas. Todo en una transacción.
 *
 * Devuelve los ids de sugerencias invalidadas (para publicar `match.expired`)
 * y de las applications auto-rechazadas (para notificarlas si hiciera falta).
 */
export const acceptApplication = async (
  db: Db,
  application: { id: string; personId: string; teamId: string },
): Promise<{ invalidatedSuggestionIds: string[] }> => {
  return db.transaction(async (tx) => {
    await tx
      .update(edges)
      .set({ meta: sqlMerge({ status: 'accepted', resolvedAt: Date.now() }) })
      .where(eq(edges.id, application.id));

    await tx.insert(edges).values({
      id: edgeId('member_of', application.personId, application.teamId),
      kind: 'member_of',
      fromId: application.personId,
      toId: application.teamId,
    });

    const otherPending = await tx
      .select({ id: edges.id })
      .from(edges)
      .where(and(eq(edges.kind, 'applied_to'), eq(edges.fromId, application.personId)));
    for (const row of otherPending) {
      if (row.id === application.id) continue;
      await tx
        .update(edges)
        .set({ meta: sqlMerge({ status: 'auto_rejected', resolvedAt: Date.now() }) })
        .where(eq(edges.id, row.id));
    }

    const liveSuggestions = await tx
      .select({ id: suggestions.id })
      .from(suggestions)
      .where(and(eq(suggestions.personId, application.personId), eq(suggestions.status, 'live')));
    for (const s of liveSuggestions) {
      await tx.update(suggestions).set({ status: 'expired' }).where(eq(suggestions.id, s.id));
      // Misma regla que en agent/suggestion-repository.ts: la fila de
      // `suggestions` permanece, la arista `suggested` se borra del grafo.
      await tx.delete(edges).where(and(eq(edges.kind, 'suggested'), eq(edges.id, s.id)));
    }

    return { invalidatedSuggestionIds: liveSuggestions.map((s) => s.id) };
  });
};

export const rejectApplication = async (db: Db, id: string): Promise<void> => {
  await db
    .update(edges)
    .set({ meta: sqlMerge({ status: 'rejected', resolvedAt: Date.now() }) })
    .where(eq(edges.id, id));
};

/**
 * `edges.meta` es `jsonb`; un `set({ meta: {...} })` reemplazaría el objeto
 * entero y perdería `message`. Este helper hace `meta || parche` en SQL para
 * fusionar sin leer la fila primero.
 */
const sqlMerge = (patch: Record<string, unknown>) => sql`${edges.meta} || ${JSON.stringify(patch)}::jsonb`;
