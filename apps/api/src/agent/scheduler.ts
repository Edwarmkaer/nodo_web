import PQueue from 'p-queue';

/**
 * Tercera costura, más pequeña, que existe solo para las pruebas de AC-02 y
 * AC-03 (docs/10): sin ella, "ejecutar el matchmaker de forma síncrona"
 * obligaría a esperar los 800 ms de debounce en cada prueba.
 */
export interface Scheduler {
  schedule(key: string, task: () => Promise<void>): void;
}

/**
 * Cola en memoria, concurrencia 2, debounce por entidad (ADR-004, docs/06).
 * Un reinicio pierde la tanda en vuelo; la siguiente escritura la regenera —
 * aceptado explícitamente.
 */
export class PQueueScheduler implements Scheduler {
  private readonly queue: PQueue;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly debounceMs: number,
    concurrency = 2,
  ) {
    this.queue = new PQueue({ concurrency });
  }

  schedule(key: string, task: () => Promise<void>): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      // Una tanda fallida degrada (se pierde esa sugerencia; la siguiente
      // escritura la regenera), nunca debe tumbar el proceso entero. Sin este
      // catch, un rechazo no capturado de `task()` es una promesa rechazada
      // sin manejar y Node termina el proceso completo — muy por encima del
      // radio de daño de "falló una tanda del matchmaker".
      void this.queue.add(task).catch((error: unknown) => {
        console.error(`[matchmaker] la tanda para "${key}" falló`, error);
      });
    }, this.debounceMs);

    this.timers.set(key, timer);
  }
}

/** Ejecuta en el acto, sin debounce ni cola. Es lo que hace síncronas las pruebas de servicio. */
export class SyncScheduler implements Scheduler {
  private readonly pending: Promise<void>[] = [];

  schedule(key: string, task: () => Promise<void>): void {
    this.pending.push(task());
  }

  /** Para que la prueba espere explícitamente a que termine la tanda encolada. */
  async drain(): Promise<void> {
    await Promise.all(this.pending);
    this.pending.length = 0;
  }
}
