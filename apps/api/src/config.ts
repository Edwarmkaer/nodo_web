import { z } from 'zod';

/**
 * Toda variable de entorno de docs/08, validada al arrancar.
 *
 * El proceso no levanta con una configuración incompleta: un backend que
 * arranca sin `PORTAL_SECRET` y falla en la primera publicación es más difícil
 * de diagnosticar que uno que no arranca.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  // Portal
  PORTAL_SECRET: z.string().min(1),
  PORTAL_PUBLIC_KEY: z.string().min(1).optional(),
  PORTAL_ENV_ID: z.string().min(1).optional(),
  PORTAL_WEBHOOK_SECRET: z.string().min(1),
  PORTAL_API_URL: z.string().url().default('https://api.useportal.co'),

  // Base de datos
  DATABASE_URL: z.string().min(1),

  // Identidad
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_ISSUER: z.string().url(),
  /** Debe coincidir con la entrada del JWKS o Portal no puede verificar. */
  JWT_KID: z.string().min(1).default('nodo-1'),

  // LLM — intercambiable, ver ADR-007
  LLM_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),

  // Agente — ajustables sin desplegar
  MATCH_SCORE_THRESHOLD: z.coerce.number().default(3),
  MATCH_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(800),
  MATCH_MAX_PER_PERSON: z.coerce.number().int().positive().default(3),
  MATCH_MAX_PER_TEAM: z.coerce.number().int().positive().default(5),
  SUGGESTION_TTL_MINUTES: z.coerce.number().int().positive().default(120),

  /** Límite por sesión de docs/05. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Railway y `.env` guardan la clave PEM en una línea con `\n` escapado.
 * `jose` necesita los saltos reales.
 */
const unescapePem = (pem: string): string => pem.replace(/\\n/g, '\n');

/**
 * Carga `.env` en `process.env` si el archivo existe — desarrollo local,
 * donde nadie exporta las variables a mano en la shell antes de arrancar. En
 * producción no hay `.env` (docs/08: "nunca se versiona"; Railway inyecta las
 * variables directamente), así que esto no hace nada allí. `loadEnvFile` es
 * nativo de Node 20.6+; sin dependencia nueva.
 */
export const loadDotEnvIfPresent = (): void => {
  try {
    process.loadEnvFile();
  } catch {
    // No hay .env en este directorio — normal en producción.
  }
};

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  loadDotEnvIfPresent();
  const parsed = EnvSchema.safeParse(source);

  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida. Revisa .env contra docs/08:\n${detalle}`);
  }

  return { ...parsed.data, JWT_PRIVATE_KEY: unescapePem(parsed.data.JWT_PRIVATE_KEY) };
};
