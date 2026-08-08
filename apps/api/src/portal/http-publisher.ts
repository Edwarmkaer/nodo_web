import type { AnyEvent } from '@nodo/contracts';
import type { PortalPublisher } from './publisher.js';

export class PortalHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PortalHttpError';
  }
}

/**
 * Implementación real: `POST /v1/channels/{id}/messages` con `Bearer sk_`
 * (docs/05, docs/08). Solo el backend tiene `PORTAL_SECRET`; nunca sale de
 * aquí.
 *
 * Portal exige su propio sobre de transporte, distinto del `Envelope` de
 * dominio: `{ senderId, type, content }`, con nuestro `Envelope` completo
 * dentro de `content`. No está documentado en `docs.useportal.co` — se
 * confirmó contra la API real (`400 senderId is required` → `400 content is
 * required` → `200`). `senderId` es `"{actor.kind}:{actor.id}"`, el mismo
 * formato que el guardarraíl anti-bucle de `webhook.ts` compara contra
 * `'agent:matchmaker'` (ADR-004).
 */
export class HttpPortalPublisher implements PortalPublisher {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async publish(channel: string, envelope: AnyEvent): Promise<{ id: string; seq: number }> {
    const response = await fetch(`${this.baseUrl}/v1/channels/${channel}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify({
        senderId: `${envelope.actor.kind}:${envelope.actor.id}`,
        type: envelope.type,
        content: envelope,
      }),
    });

    if (!response.ok) {
      throw new PortalHttpError(
        response.status,
        `Portal rechazó la publicación en "${channel}": ${response.status}`,
      );
    }

    const data = (await response.json()) as { id: string; seq: number };
    return { id: data.id, seq: data.seq };
  }
}
