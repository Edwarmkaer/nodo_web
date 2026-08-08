import type { Context, MiddlewareHandler } from 'hono';
import { errors } from '../../domain/errors.js';
import type { Vars } from '../context.js';

/**
 * Ventana fija en memoria: 60 req/min por sesión (docs/05). No sobrevive a un
 * reinicio ni se comparte entre instancias — igual que la cola del agente,
 * es una limitación aceptada mientras el backend viva en un solo proceso.
 */
export const rateLimit = (
  perMinute: number,
  keyOf: (c: Context<{ Variables: Vars }>) => string = (c) =>
    c.req.header('x-forwarded-for') ?? 'anon',
): MiddlewareHandler<{ Variables: Vars }> => {
  const hits = new Map<string, { count: number; windowStart: number }>();
  const windowMs = 60_000;

  return async (c, next) => {
    const key = keyOf(c);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
      if (entry.count > perMinute) throw errors.rateLimited();
    }

    await next();
  };
};
