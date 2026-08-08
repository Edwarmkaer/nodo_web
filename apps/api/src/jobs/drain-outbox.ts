import { and, asc, eq, sql } from 'drizzle-orm';
import type { AnyEvent } from '@nodo/contracts';
import { MAIN_CHANNEL } from '@nodo/contracts';
import type { Db } from '../db/client.js';
import { channelWatermarks, outbox } from '../db/schema.js';
import type { PortalPublisher } from '../portal/publisher.js';

/**
 * Reintento de publicaciones fallidas (ADR-005): job cada 10 s. El estado en
 * Postgres ya es correcto cuando una fila llega aquí — solo falta que Portal
 * la reciba.
 */
export const drainOutbox = async (db: Db, portal: PortalPublisher, batchSize = 20): Promise<number> => {
  const pending = await db
    .select()
    .from(outbox)
    .where(eq(outbox.published, false))
    .orderBy(asc(outbox.createdAt))
    .limit(batchSize);

  let drained = 0;

  for (const row of pending) {
    try {
      const { seq } = await portal.publish(row.channel, row.envelope as AnyEvent);
      await db.update(outbox).set({ published: true }).where(eq(outbox.id, row.id));
      if (row.channel === MAIN_CHANNEL) {
        await db
          .insert(channelWatermarks)
          .values({ channel: MAIN_CHANNEL, seq })
          .onConflictDoUpdate({ target: channelWatermarks.channel, set: { seq, updatedAt: sql`now()` } });
      }
      drained += 1;
    } catch (error) {
      await db
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1` })
        .where(eq(outbox.id, row.id));
      console.error(`[outbox] reintento fallido para el canal "${row.channel}"`, error);
    }
  }

  return drained;
};

export const INTERVAL_MS = 10_000;
