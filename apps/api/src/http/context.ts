import type { JWK } from 'jose';
import type { PersonStatus } from '@nodo/contracts';
import type { Env } from '../config.js';
import type { Db } from '../db/client.js';
import type { SkillVocabulary } from '../domain/skill-vocabulary.js';
import type { LlmProvider } from '../agent/llm.js';
import type { MatchmakerService } from '../agent/matchmaker.js';
import type { MatchmakerDebugLog } from '../agent/debug-log.js';
import type { Scheduler } from '../agent/scheduler.js';
import type { EventPublisher } from '../portal/event-publisher.js';
import type { PortalTokenIssuer } from '../portal/jwt.js';

/**
 * Todo lo que las rutas necesitan, ensamblado una vez al arrancar. Las rutas
 * reciben esto, nunca construyen sus propias dependencias — es lo que hace
 * que `createApp(ctx)` acepte dobles en pruebas de servicio (docs/10).
 */
export type AppContext = {
  db: Db;
  vocabulary: SkillVocabulary;
  llm: LlmProvider;
  scheduler: Scheduler;
  matchmaker: MatchmakerService;
  publisher: EventPublisher;
  jwtIssuer: PortalTokenIssuer;
  jwks: { keys: JWK[] };
  debugLog: MatchmakerDebugLog;
  env: Env;
};

export type AuthInfo = {
  personId: string;
  handle: string;
  displayName: string;
  status: PersonStatus;
  teamId: string | null;
};

/** Variables de contexto de Hono. `auth` solo existe tras `requireAuth`. */
export type Vars = { auth: AuthInfo };

