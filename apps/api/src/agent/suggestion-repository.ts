import type { NeedRef, SuggestionDirection } from '@nodo/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { edges, suggestions } from '../db/schema.js';

export type NewSuggestion = {
  id: string;
  personId: string;
  teamId: string;
  score: number;
  direction: SuggestionDirection;
  matchedSkills: NeedRef[];
  rationale: string;
  expiresAt: Date;
};

export interface SuggestionRepository {
  /**
   * Guardarraíl 1 (docs/06): `on conflict do nothing` sobre
   * `(person_id, team_id)`. Devuelve `false` si el par ya estaba quemado —
   * ese es el caso normal, no un error que deba abortar la tanda.
   */
  tryClaim(row: NewSuggestion): Promise<boolean>;

  countLive(filter: { personId: string } | { teamId: string }): Promise<number>;

  /** La sugerencia viva de menor score, para desplazar (guardarraíles 3 y 4). */
  lowestLive(filter: { personId: string } | { teamId: string }): Promise<{ id: string } | undefined>;

  /** Desplazamiento o caducidad: pasa a `expired`. La fila no se borra. */
  expire(id: string): Promise<void>;

  updateRationale(id: string, rationale: string): Promise<void>;
}

export class DrizzleSuggestionRepository implements SuggestionRepository {
  constructor(private readonly db: Db) {}

  /**
   * Además de la fila en `suggestions`, materializa la arista `suggested` en
   * `edges` (docs/02: "se materializa como una arista"). Sin esto, `GET
   * /v1/graph` nunca la mostraría: el `GraphPatch` del sobre solo llega a
   * clientes ya conectados a Portal, y el snapshot es la fuente para
   * cualquiera que recién carga. Postgres manda (ADR-005); el snapshot tiene
   * que reflejar lo mismo que un cliente en vivo ve.
   *
   * La arista usa `expires_at`, así que la caducidad por tiempo desaparece
   * sola del snapshot (`getGraphSnapshot` ya filtra por `expires_at`), sin
   * job adicional. El desplazamiento y la invalidación explícita sí borran
   * la fila en `expire()`, porque ahí la sugerencia debe desaparecer antes
   * de su hora.
   */
  async tryClaim(row: NewSuggestion): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const result = await tx
        .insert(suggestions)
        .values({
          id: row.id,
          personId: row.personId,
          teamId: row.teamId,
          score: row.score,
          direction: row.direction,
          matchedSkills: row.matchedSkills,
          rationale: row.rationale,
          expiresAt: row.expiresAt,
        })
        .onConflictDoNothing({ target: [suggestions.personId, suggestions.teamId] })
        .returning({ id: suggestions.id });

      if (result.length === 0) return false;

      await tx.insert(edges).values({
        id: row.id,
        kind: 'suggested',
        fromId: row.personId,
        toId: row.teamId,
        weight: row.score,
        transient: true,
        expiresAt: row.expiresAt,
      });

      return true;
    });
  }

  async countLive(filter: { personId: string } | { teamId: string }): Promise<number> {
    const column = 'personId' in filter ? suggestions.personId : suggestions.teamId;
    const value = 'personId' in filter ? filter.personId : filter.teamId;
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(and(eq(column, value), eq(suggestions.status, 'live')));
    return row?.count ?? 0;
  }

  async lowestLive(
    filter: { personId: string } | { teamId: string },
  ): Promise<{ id: string } | undefined> {
    const column = 'personId' in filter ? suggestions.personId : suggestions.teamId;
    const value = 'personId' in filter ? filter.personId : filter.teamId;
    const [row] = await this.db
      .select({ id: suggestions.id })
      .from(suggestions)
      .where(and(eq(column, value), eq(suggestions.status, 'live')))
      .orderBy(asc(suggestions.score))
      .limit(1);
    return row;
  }

  async expire(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(suggestions).set({ status: 'expired' }).where(eq(suggestions.id, id));
      // La fila de `suggestions` permanece (guardarraíl 1); la arista se
      // borra: es lo que hace desaparecer la sugerencia del grafo antes de
      // su `expires_at` natural.
      await tx.delete(edges).where(and(eq(edges.kind, 'suggested'), eq(edges.id, id)));
    });
  }

  async updateRationale(id: string, rationale: string): Promise<void> {
    await this.db.update(suggestions).set({ rationale }).where(eq(suggestions.id, id));
  }
}

/** Doble de pruebas, sin Postgres: reproduce el guardarraíl 1 en memoria. */
export class FakeSuggestionRepository implements SuggestionRepository {
  readonly rows = new Map<string, NewSuggestion & { status: 'live' | 'expired' }>();
  private readonly claimedPairs = new Set<string>();

  async tryClaim(row: NewSuggestion): Promise<boolean> {
    const pairKey = `${row.personId}:${row.teamId}`;
    if (this.claimedPairs.has(pairKey)) return false;
    this.claimedPairs.add(pairKey);
    this.rows.set(row.id, { ...row, status: 'live' });
    return true;
  }

  async countLive(filter: { personId: string } | { teamId: string }): Promise<number> {
    return [...this.rows.values()].filter(
      (r) =>
        r.status === 'live' &&
        ('personId' in filter ? r.personId === filter.personId : r.teamId === filter.teamId),
    ).length;
  }

  async lowestLive(
    filter: { personId: string } | { teamId: string },
  ): Promise<{ id: string } | undefined> {
    const live = [...this.rows.entries()]
      .filter(
        ([, r]) =>
          r.status === 'live' &&
          ('personId' in filter ? r.personId === filter.personId : r.teamId === filter.teamId),
      )
      .sort((a, b) => a[1].score - b[1].score);
    return live[0] ? { id: live[0][0] } : undefined;
  }

  async expire(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.status = 'expired';
  }

  async updateRationale(id: string, rationale: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.rationale = rationale;
  }
}
