import type { AnyEvent } from '@nodo/contracts';

/**
 * Una de las dos costuras de docs/07 y docs/10. `agent/` llama al modelo a
 * través de `LlmProvider`; `portal/` publica a través de esta interfaz. Ambas
 * hacen sustituible su dependencia externa en pruebas y en producción.
 */
export interface PortalPublisher {
  publish(channel: string, envelope: AnyEvent): Promise<{ id: string; seq: number }>;
}
