import { MAIN_CHANNEL, teamChannel, type MainEvent, type TeamEvent } from '@nodo/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { channelWatermarks, outbox } from '../db/schema.js';
import type { PortalPublisher } from './publisher.js';

/**
 * Las dos escrituras de infraestructura que siguen a una publicación,
 * detrás de una interfaz angosta en vez del `Db` completo: así una prueba
 * puede verificar `EventPublisher` sin una Postgres real, que es justamente
 * la dependencia que docs/10 reserva al nivel "Datos".
 */
export interface WatermarkStore {
  record(channel: string, seq: number): Promise<void>;
}

export interface OutboxStore {
  enqueue(channel: string, envelope: MainEvent | TeamEvent): Promise<void>;
}

export class DrizzleWatermarkStore implements WatermarkStore {
  constructor(private readonly db: Db) {}

  async record(channel: string, seq: number): Promise<void> {
    await this.db
      .insert(channelWatermarks)
      .values({ channel, seq })
      .onConflictDoUpdate({
        target: channelWatermarks.channel,
        set: { seq, updatedAt: sql`now()` },
      });
  }
}

export class DrizzleOutboxStore implements OutboxStore {
  constructor(private readonly db: Db) {}

  async enqueue(channel: string, envelope: MainEvent | TeamEvent): Promise<void> {
    await this.db.insert(outbox).values({ channel, envelope });
  }
}

/**
 * Regla de publicación de docs/05: **nunca** dentro de la transacción de
 * dominio. Se invoca después del `commit`, con el estado ya comprometido.
 *
 * Si Portal falla, la fila va a `outbox` para reintento (job de docs/07) y
 * **no se revierte nada**: Postgres ya tiene el estado correcto. Publicar
 * antes del commit anunciaría un estado que puede no existir (ADR-005) — por
 * eso esta clase no participa de ninguna transacción de dominio.
 */
export class EventPublisher {
  constructor(
    private readonly portal: PortalPublisher,
    private readonly watermarks: WatermarkStore,
    private readonly outboxStore: OutboxStore,
  ) {}

  /** Actualiza la marca de agua de `network-main` (ADR-009). */
  async publishMain(envelope: MainEvent): Promise<void> {
    await this.publish(MAIN_CHANNEL, envelope, { isMain: true });
  }

  /** Los sobres de `team-{id}` no mutan el grafo y no llevan marca de agua. */
  async publishTeam(teamId: string, envelope: TeamEvent): Promise<void> {
    await this.publish(teamChannel(teamId), envelope, { isMain: false });
  }

  private async publish(
    channel: string,
    envelope: MainEvent | TeamEvent,
    opts: { isMain: boolean },
  ): Promise<void> {
    try {
      const { seq } = await this.portal.publish(channel, envelope);
      if (opts.isMain) await this.watermarks.record(channel, seq);
    } catch (error) {
      await this.outboxStore.enqueue(channel, envelope);
      console.error(
        `[portal] fallo publicando en "${channel}", tipo "${envelope.type}"; encolado en outbox.`,
        error,
      );
    }
  }
}
