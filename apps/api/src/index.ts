import { serve } from '@hono/node-server';
import { loadEnv } from './config.js';
import { createDb } from './db/client.js';
import { loadVocabulary } from './db/skills-repo.js';
import { createApp } from './http/app.js';
import type { AppContext } from './http/context.js';
import { startJobs } from './jobs/index.js';
import { MatchmakerDebugLog } from './agent/debug-log.js';
import { DrizzleCandidateRepository } from './agent/candidate-repository.js';
import { withTimeout } from './agent/llm-groq.js';
import { GroqLlmProvider } from './agent/llm-groq.js';
import { MatchmakerService } from './agent/matchmaker.js';
import { PQueueScheduler } from './agent/scheduler.js';
import { DrizzleSuggestionRepository } from './agent/suggestion-repository.js';
import { EventPublisher, DrizzleWatermarkStore, DrizzleOutboxStore } from './portal/event-publisher.js';
import { HttpPortalPublisher } from './portal/http-publisher.js';
import { buildJwks, PortalTokenIssuer } from './portal/jwt.js';

/**
 * Red de seguridad de último recurso. El backend no sostiene conexiones
 * persistentes y está diseñado para poder reiniciarse en cualquier momento
 * sin consecuencia (docs/07) — pero eso vale para un reinicio *deliberado*,
 * no para morir en silencio por un rechazo sin capturar en algún rincón que
 * esta auditoría no cubrió. Se deja constancia en el log en vez de que el
 * proceso desaparezca sin explicación.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] promesa rechazada sin capturar', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[fatal] excepción no capturada', error);
});

const main = async (): Promise<void> => {
  const env = loadEnv();
  const { db } = createDb(env.DATABASE_URL);

  const vocabulary = await loadVocabulary(db);
  if (vocabulary.all().length === 0) {
    console.warn('[arranque] el vocabulario está vacío — ejecuta `pnpm db:seed` (docs/08).');
  }

  const portalPublisher = new HttpPortalPublisher(env.PORTAL_API_URL, env.PORTAL_SECRET);
  const publisher = new EventPublisher(
    portalPublisher,
    new DrizzleWatermarkStore(db),
    new DrizzleOutboxStore(db),
  );

  const jwtIssuer = await PortalTokenIssuer.create(env.JWT_PRIVATE_KEY, env.JWT_ISSUER, env.JWT_KID);
  const jwks = await buildJwks(env.JWT_PRIVATE_KEY, env.JWT_KID);

  const rawLlm = new GroqLlmProvider(
    env.LLM_API_KEY,
    env.LLM_BASE_URL,
    env.LLM_MODEL,
    vocabulary.promptCatalog(),
  );
  const llm = withTimeout(rawLlm, env.LLM_TIMEOUT_MS);

  const debugLog = new MatchmakerDebugLog();
  const matchmaker = new MatchmakerService(
    new DrizzleCandidateRepository(db),
    new DrizzleSuggestionRepository(db),
    llm,
    publisher,
    debugLog,
    {
      scoreThreshold: env.MATCH_SCORE_THRESHOLD,
      ttlMinutes: env.SUGGESTION_TTL_MINUTES,
      maxPerPerson: env.MATCH_MAX_PER_PERSON,
      maxPerTeam: env.MATCH_MAX_PER_TEAM,
    },
  );

  const scheduler = new PQueueScheduler(env.MATCH_DEBOUNCE_MS);

  const ctx: AppContext = {
    db,
    vocabulary,
    llm,
    scheduler,
    matchmaker,
    publisher,
    jwtIssuer,
    jwks,
    debugLog,
    env,
  };

  const app = createApp(ctx);
  const jobs = startJobs(db, publisher, portalPublisher);

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    // URL completa, no solo el puerto: así la terminal la vuelve clicable.
    // No hay "página de bienvenida" que visitar — esto es una API, no un
    // frontend — pero /health y /v1/graph sí se pueden abrir directo.
    console.log(`[arranque] Nodo API escuchando en http://localhost:${info.port} (${env.NODE_ENV})`);
    console.log(`[arranque] prueba rápida: http://localhost:${info.port}/health`);
  });
  // Sin este listener, un `error` del socket (p. ej. EADDRINUSE si un recargo
  // de `tsx watch` reintenta escuchar antes de soltar el puerto anterior) es
  // una excepción no capturada: el proceso queda vivo — los timers de jobs/
  // lo mantienen — pero sin nada escuchando en el puerto. Aquí al menos
  // queda visible en el log en vez de morir en silencio.
  server.on('error', (error) => {
    console.error(`[fatal] el servidor HTTP falló en :${env.PORT}`, error);
  });

  const shutdown = (signal: string) => {
    console.log(`[apagado] recibida ${signal}, cerrando...`);
    jobs.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

main().catch((error: unknown) => {
  console.error('[arranque] fallo fatal', error);
  process.exit(1);
});
