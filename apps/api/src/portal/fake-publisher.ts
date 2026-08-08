import type { AnyEvent } from '@nodo/contracts';
import type { PortalPublisher } from './publisher.js';

/**
 * Doble de pruebas de docs/10. Acumula lo publicado para afirmar sobre canal,
 * `type` y `graph` sin tocar la red.
 *
 * `portal.published` vacío tras un intento que debía fallar es justo la
 * aserción que protege `commit → publish` en AC-05: si un handler publicara
 * antes de la transacción, esta lista dejaría de estar vacía.
 */
export class FakePortalPublisher implements PortalPublisher {
  readonly published: Array<{ channel: string; envelope: AnyEvent }> = [];
  private seq = 0;
  failNext = false;

  async publish(channel: string, envelope: AnyEvent): Promise<{ id: string; seq: number }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('fallo simulado de Portal');
    }
    this.seq += 1;
    this.published.push({ channel, envelope });
    return { id: `msg_${this.seq}`, seq: this.seq };
  }

  reset(): void {
    this.published.length = 0;
    this.seq = 0;
    this.failNext = false;
  }
}
