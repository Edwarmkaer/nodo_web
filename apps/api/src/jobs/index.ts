import type { Db } from '../db/client.js';
import type { EventPublisher } from '../portal/event-publisher.js';
import type { PortalPublisher } from '../portal/publisher.js';
import { drainOutbox, INTERVAL_MS as DRAIN_INTERVAL_MS } from './drain-outbox.js';
import { expireDueSuggestions, INTERVAL_MS as EXPIRE_INTERVAL_MS } from './expire-suggestions.js';

export type JobHandles = { stop: () => void };

/** Arranca los dos jobs de docs/07 y devuelve cómo detenerlos (para tests y para un apagado limpio). */
export const startJobs = (db: Db, publisher: EventPublisher, portal: PortalPublisher): JobHandles => {
  const expireTimer = setInterval(() => {
    expireDueSuggestions(db, publisher).catch((error: unknown) => {
      console.error('[jobs] fallo caducando sugerencias', error);
    });
  }, EXPIRE_INTERVAL_MS);

  const drainTimer = setInterval(() => {
    drainOutbox(db, portal).catch((error: unknown) => {
      console.error('[jobs] fallo drenando outbox', error);
    });
  }, DRAIN_INTERVAL_MS);

  // No deben mantener el proceso vivo por sí solos.
  expireTimer.unref();
  drainTimer.unref();

  return {
    stop: () => {
      clearInterval(expireTimer);
      clearInterval(drainTimer);
    },
  };
};

export { drainOutbox, expireDueSuggestions };
