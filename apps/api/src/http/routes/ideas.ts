import { CreateIdeaRequest, type IdeaResponse, type IdeasResponse } from '@nodo/contracts';
import { createIdea, listIdeas, loadIdeaDTO, toggleInterest } from '../../db/ideas-repo.js';
import { errors } from '../../domain/errors.js';
import { ideaPublished } from '../../domain/envelopes.js';
import { ideaId as newIdeaId } from '../../domain/ids.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

export const ideasRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.post('/v1/ideas', requireAuth(ctx), async (c) => {
    const auth = c.get('auth');
    const parsed = CreateIdeaRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const id = newIdeaId();
    await createIdea(ctx.db, {
      id,
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      authorId: auth.personId,
    });

    const idea = (await loadIdeaDTO(ctx.db, id))!;
    await ctx.publisher.publishMain(ideaPublished(idea));

    const body: IdeaResponse = { idea };
    return c.json(body, 201);
  });

  router.get('/v1/ideas', async (c) => {
    const ideas = await listIdeas(ctx.db);
    const body: IdeasResponse = { ideas };
    return c.json(body);
  });

  router.post('/v1/ideas/:id/interest', requireAuth(ctx), async (c) => {
    const ideaId = c.req.param('id');
    const auth = c.get('auth');

    const idea = await loadIdeaDTO(ctx.db, ideaId);
    if (!idea) throw errors.notFound('No encontramos esa idea.');

    const interested = await toggleInterest(ctx.db, auth.personId, ideaId);
    return c.json({ interested });
  });

  return router;
};
