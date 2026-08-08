import { z } from 'zod';
import { chatAboutGraph, chatAboutSuggestion, SuggestionNotFoundError } from '../../agent/debug-chat.js';
import { errors } from '../../domain/errors.js';
import type { AppContext } from '../context.js';
import { createRouter } from '../types.js';

const ChatRequest = z.object({
  /** Si viene, chatea sobre esa sugerencia puntual; si no, sobre el grafo en general. */
  suggestionId: z.string().min(1).optional(),
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .default([]),
});

/**
 * Rutas de observación, no del contrato — no viven en `@nodo/contracts` ni
 * en docs/05. `/v1/_debug/matchmaker` ya sentaba el patrón; `/v1/_debug/chat`
 * lo sigue para el chat de demo (ver `agent/debug-chat.ts`).
 */
export const debugRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.get('/v1/_debug/matchmaker', (c) => c.json({ batches: ctx.debugLog.recent() }));

  router.post('/v1/_debug/chat', async (c) => {
    const parsed = ChatRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    try {
      const reply = parsed.data.suggestionId
        ? await chatAboutSuggestion(ctx.db, ctx.env, parsed.data.suggestionId, parsed.data.message, parsed.data.history)
        : await chatAboutGraph(ctx.db, ctx.env, parsed.data.message, parsed.data.history);
      return c.json({ reply });
    } catch (error) {
      if (error instanceof SuggestionNotFoundError) throw errors.notFound(error.message);
      throw error;
    }
  });

  return router;
};
