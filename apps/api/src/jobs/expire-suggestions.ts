import { and, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { suggestions } from '../db/schema.js';
import { matchExpired } from '../domain/envelopes.js';
import type { EventPublisher } from '../portal/event-publisher.js';

/**
 * Guardarraíl 2 (docs/06): cada 5 min pasa las sugerencias vencidas a
 * `expired` y publica `match.expired`, para que el grafo no acumule
 * sugerencias muertas. Las filas **no se eliminan** — si se eliminaran, el
 * guardarraíl 1 dejaría de aplicar y el mismo par volvería a sugerirse.
 */
export const expireDueSuggestions = async (db: Db, publisher: EventPublisher): Promise<number> => {
  const due = await db
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(and(eq(suggestions.status, 'live'), lte(suggestions.expiresAt, new Date())));

  for (const row of due) {
    await db.update(suggestions).set({ status: 'expired' }).where(eq(suggestions.id, row.id));
    await publisher.publishMain(matchExpired(row.id));
  }

  return due.length;
};

export const INTERVAL_MS = 5 * 60_000;
