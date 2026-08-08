import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PQueueScheduler, SyncScheduler } from './scheduler.js';

describe('PQueueScheduler — debounce de docs/06', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cinco disparos seguidos sobre la misma entidad producen una sola ejecución', async () => {
    const scheduler = new PQueueScheduler(800);
    const task = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 5; i += 1) {
      scheduler.schedule('per_camilo', task);
      await vi.advanceTimersByTimeAsync(100); // cinco PATCH seguidos, cada uno reinicia el debounce
    }

    await vi.advanceTimersByTimeAsync(800);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('entidades distintas no se debouncean entre sí', async () => {
    const scheduler = new PQueueScheduler(800);
    const taskA = vi.fn().mockResolvedValue(undefined);
    const taskB = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule('per_camilo', taskA);
    scheduler.schedule('tm_healthai', taskB);
    await vi.advanceTimersByTimeAsync(800);

    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });
});

describe('SyncScheduler — hace síncronas las pruebas de servicio', () => {
  it('ejecuta en el acto, sin esperar ningún debounce', async () => {
    const scheduler = new SyncScheduler();
    const task = vi.fn().mockResolvedValue(undefined);
    scheduler.schedule('per_camilo', task);
    await scheduler.drain();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
