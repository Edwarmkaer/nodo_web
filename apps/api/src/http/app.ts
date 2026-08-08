import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppContext, Vars } from './context.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { applicationsRoutes } from './routes/applications.js';
import { debugRoutes } from './routes/debug.js';
import { graphRoutes } from './routes/graph.js';
import { healthRoutes } from './routes/health.js';
import { ideasRoutes } from './routes/ideas.js';
import { peopleRoutes } from './routes/people.js';
import { portalRoutes } from './routes/portal.js';
import { sessionRoutes } from './routes/session.js';
import { skillsRoutes } from './routes/skills.js';
import { teamsRoutes } from './routes/teams.js';

/**
 * Composición de la API. Ninguna ruta construye su propia dependencia — todo
 * llega en `ctx` (docs/07: "domain no importa portal ni http", pero http sí
 * importa ambos, que es exactamente su trabajo).
 */
export const createApp = (ctx: AppContext) => {
  const app = new Hono<{ Variables: Vars }>();

  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: ctx.env.NODE_ENV === 'production' ? [] : '*',
      allowHeaders: ['content-type', 'authorization', 'x-recovery-code'],
    }),
  );
  app.use(
    '/v1/*',
    rateLimit(ctx.env.RATE_LIMIT_PER_MINUTE, (c) => {
      const header = c.req.header('authorization');
      return header ?? c.req.header('x-forwarded-for') ?? 'anon';
    }),
  );

  app.onError(errorHandler);

  app.route('/', healthRoutes);
  app.route('/', graphRoutes(ctx));
  app.route('/', sessionRoutes(ctx));
  app.route('/', peopleRoutes(ctx));
  app.route('/', skillsRoutes(ctx));
  app.route('/', ideasRoutes(ctx));
  app.route('/', teamsRoutes(ctx));
  app.route('/', applicationsRoutes(ctx));
  app.route('/', portalRoutes(ctx));
  app.route('/', debugRoutes(ctx));

  return app;
};
