# 08 — Configuración y despliegue

## Provisión de Portal

```bash
npm install -g @portalsdk/cli
portal login
portal projects create nodo
```

`portal projects create` imprime el id del entorno. Con él se emiten las claves:

```bash
portal keys create --env <ENV_ID> --type public   # pk_…  la consume el frontend
portal keys create --env <ENV_ID> --type secret   # sk_…  no sale del servidor
```

Los navegadores en orígenes no registrados quedan bloqueados, así que cada origen desde el que se sirva la aplicación debe declararse:

```bash
portal origins add https://nodo.app       --env <ENV_ID>
portal origins add http://localhost:5173  --env <ENV_ID>
```

La configuración de canales, `authz` y `notify` ([03](03-portal-contract.md)) se publica aparte del backend:

```bash
npm install -D @portalsdk/config
portal deploy
```

`portal origins add` y `portal deploy` forman parte del procedimiento de despliegue: el primero tras cualquier cambio de dominio, el segundo tras cualquier cambio en `portal.config.ts`.

## Variables de entorno

```bash
# Portal
PORTAL_SECRET=sk_...
PORTAL_PUBLIC_KEY=pk_...
PORTAL_ENV_ID=env_...
PORTAL_WEBHOOK_SECRET=whsec_...
PORTAL_API_URL=https://api.useportal.co

# Base de datos
DATABASE_URL=postgresql://...        # pooler en modo transaction

# Identidad
JWT_PRIVATE_KEY=...                  # RS256, PEM en una línea
JWT_ISSUER=https://api.nodo.app

# LLM — intercambiable, ver ADR-007
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile

# Agente — ajustables sin desplegar
MATCH_SCORE_THRESHOLD=3
MATCH_DEBOUNCE_MS=800
MATCH_MAX_PER_PERSON=3
MATCH_MAX_PER_TEAM=5
SUGGESTION_TTL_MINUTES=120
LLM_TIMEOUT_MS=4000

# App
SESSION_SECRET=...
PORT=8080
NODE_ENV=production
```

Los seis parámetros del agente son variables de entorno de forma deliberada: gobiernan el comportamiento del matchmaker y se ajustan sin redesplegar código.

`.env.example` se versiona con las claves vacías. `.env` no se versiona nunca.

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Verificación en cadena:

```bash
curl localhost:8080/health
curl localhost:8080/v1/skills | jq '.skills | length'
curl localhost:8080/.well-known/jwks.json | jq '.keys[0].kid'
curl localhost:8080/v1/graph | jq '{n:(.nodes|length), e:(.edges|length)}'
```

## Datos de semilla

`pnpm db:seed` carga dos conjuntos con propósitos distintos.

**Vocabulario** — obligatorio en cualquier entorno. Las ~70 skills canónicas y sus alias ([04](04-data-model.md)). Sin él no hay matching.

**Conjunto representativo** — solo en desarrollo. Personas, equipos e ideas con skills y necesidades distribuidas por categoría, en estados variados (`recruiting`, `almost_full`, `building`, `complete`). Sirve para desarrollar y calibrar el matchmaker contra datos con forma realista.

El conjunto representativo **no incluye sugerencias**: las genera el agente al arrancar, que es el comportamiento que interesa observar.

## Despliegue

```bash
railway up
railway variables set PORTAL_SECRET=... LLM_API_KEY=... JWT_PRIVATE_KEY=...
```

El backend no sostiene conexiones persistentes ([07](07-architecture.md)), así que un redespliegue no desconecta clientes: las sesiones en vivo las mantiene Portal. Solo se pierden las publicaciones en vuelo, que quedan registradas en `outbox` para reintento.

## Diagnóstico

| Síntoma | Causa probable | Resolución |
|---|---|---|
| El cliente no conecta a Portal | origen no registrado | `portal origins add` |
| `TokenExpiredError` | el token se pasó como string en lugar de callback | corregir la integración del cliente |
| Portal rechaza el JWT | `kid` distinto entre cabecera y JWKS, o `issuer` no coincide | alinear ambos con `portal.config.ts` |
| El agente no emite sugerencias | umbral demasiado alto | reducir `MATCH_SCORE_THRESHOLD` |
| Volumen excesivo de sugerencias | umbral demasiado bajo o topes desactivados | subir el umbral, revisar los guardarraíles de [06](06-matchmaker-agent.md) |
| El feed se repite en bucle | el receptor de webhook no filtra al agente | aplicar el filtro `senderId` de [ADR-004](01-decisions.md#adr-004--el-matchmaker-se-dispara-en-proceso) |
| El grafo se desincroniza | huecos de `seq` sin detectar | el snapshot reconcilia; revisar la detección de huecos en el cliente |
| Rationale genérico | falta la validación posterior al LLM | activar el fallback de plantilla |
| El LLM falla, va lento o devuelve 429 | proveedor caído o límite de tasa | cambiar `LLM_BASE_URL`, `LLM_API_KEY` y `LLM_MODEL` |
| `LLM_MODEL` devuelve 404 | el proveedor retiró ese identificador | fijar un identificador vigente |

**Proveedores de LLM compatibles** sin cambios de código, por ser compatibles con la API de OpenAI: OpenAI, Together, Fireworks, OpenRouter, Cerebras, DeepSeek y Ollama local. Mantener uno configurado como alternativa deja verificado el procedimiento de conmutación.

`GET /v1/_debug/matchmaker` devuelve las últimas 50 evaluaciones del agente con sus latencias y candidatos, que es la vía para responder por qué una sugerencia se emitió o no.
