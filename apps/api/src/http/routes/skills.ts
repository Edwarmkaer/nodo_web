import { ExtractSkillsRequest, type ExtractSkillsResponse, type SkillsResponse } from '@nodo/contracts';
import { extractSkills } from '../../agent/extract-skills.js';
import { errors } from '../../domain/errors.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

export const skillsRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.get('/v1/skills', (c) => {
    const body: SkillsResponse = { skills: ctx.vocabulary.all() };
    return c.json(body);
  });

  /** Extracción aislada, para el "previsualizar antes de guardar" (docs/05). */
  router.post('/v1/skills/extract', requireAuth(ctx), async (c) => {
    const parsed = ExtractSkillsRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const extracted = await extractSkills(ctx.llm, ctx.vocabulary, parsed.data.text);
    const body: ExtractSkillsResponse = { skills: extracted };
    return c.json(body);
  });

  return router;
};
