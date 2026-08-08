# 05 — API REST

Base: `https://api.nodo.app/v1` · Todo JSON · Zod valida entrada y salida.

La API es deliberadamente pequeña. **La superficie que el frontend consume en caliente es Portal, no esto.** Estas rutas son escritura y arranque; el estado en vivo llega por el canal.

## Autenticación

Dos credenciales distintas, no confundirlas:

| Credencial | Quién la tiene | Para qué |
|---|---|---|
| `sessionToken` (opaco) | el cliente, en `localStorage` | header `Authorization: Bearer` a **esta** API |
| JWT de Portal | el cliente, en memoria, 15 min | conectar al SDK de Portal |
| `PORTAL_SECRET` (`sk_`) | **solo el backend** | publicar a Portal |

El `sessionToken` nunca sirve para hablar con Portal, y el JWT de Portal nunca sirve para hablar con esta API.

## Rutas

### Sesión e identidad

```http
POST /v1/people
```
Acuña identidad y perfil **en el mismo acto** ([ADR-006](01-decisions.md#adr-006--identidad-sin-contraseñas)): es la única ruta de escritura sin autenticar, porque es la que emite la credencial. Su payload está en «Personas».
→ `201 { person, skills, sessionToken, recoveryCode }`

`sessionToken` y `recoveryCode` se devuelven aquí y **en ningún otro sitio**: no aparecen en ningún DTO ([09](09-contracts.md)). Un segundo envío con el mismo `handle` no duplica la identidad, la rechaza con `409 HANDLE_TAKEN`.

```http
POST /v1/session/recover
```
Devuelve la identidad a quien perdió el `localStorage`. Body `{ recoveryCode }`.
→ `200 { personId, sessionToken }` · `404 NOT_FOUND` si el código no existe.

Emite un `sessionToken` nuevo y anula el anterior. La ruta va sin autenticar y el código es de 6 caracteres, así que se limita por IP y no por sesión — el límite por sesión de la tabla de errores no aplica a una llamada que todavía no tiene una.

```http
POST /v1/portal/token          [auth]
```
Emite el JWT de Portal. **Vida: 15 min.** Incluye el claim `teams` (`{ [teamId]: 'member'|'applicant' }`) que consume `authz`.
→ `200 { token, expiresIn: 900 }`

> El cliente debe llamar a esto desde un callback `async` del SDK, nunca guardar el string. Ver [03](03-portal-contract.md).

### Grafo

```http
GET /v1/graph
```
Snapshot completo. Público y sin autenticación: el grafo es información abierta de la red.
→ `200 { nodes: GraphNode[], edges: GraphEdge[], seq: number }`

`seq` es la marca de agua de Portal en el momento del snapshot. El cliente descarta los sobres con `seq` menor o igual.

**De dónde sale ese `seq`:** cada `POST /v1/channels/{id}/messages` a Portal responde `200 { id, seq, timestamp }`. Tras cada publicación con éxito el backend hace `upsert` de la marca en `channel_watermarks`, y aquí devuelve la de `network-main` ([ADR-009](01-decisions.md#adr-009--la-marca-de-agua-seq-es-la-de-network-main)). No hay forma de "preguntarle" el `seq` actual a Portal: se conoce porque somos el único publicador ([ADR-005](01-decisions.md)). En un entorno recién sembrado, sin publicaciones, devuelve `seq: 0` y el cliente acepta todos los sobres — correcto, porque el snapshot ya trae el estado completo y los parches son idempotentes.

**El handler lee la marca antes que el grafo.** El orden inverso abre una ventana en la que un sobre publicado entre ambas lecturas queda fuera del snapshot y por debajo del `seq`, así que el cliente lo descarta y pierde ese cambio hasta la siguiente reconexión.

### Personas

```http
POST   /v1/people                       crea identidad y perfil · sin auth
PATCH  /v1/people/:id          [auth]   solo el propio
PUT    /v1/people/:id/status   [auth]   { status: 'looking'|'idle' }
GET    /v1/people/:id                   detalle público
```

`POST` es create-only: toda edición posterior pasa por `PATCH`.

`POST /v1/people`:
```jsonc
{
  "displayName": "Edwar Silva",
  "handle": "edwar",
  "headline": "Backend dev",
  "bioRaw": "Trabajo principalmente con Angular, Go y PostgreSQL.",
  "skills": ["go", "postgresql"],      // opcional: selección manual
  "availability": "full",
  "language": "es"
}
```
→ `201 { person, skills, sessionToken, recoveryCode }` · publica `person.upserted` en `network-main`.

Si viene `bioRaw` y `skills` está vacío, el backend llama al extractor (ver [06](06-matchmaker-agent.md)) **de forma síncrona** antes de responder. Tarda ~1,5 s y evita que el usuario vea un perfil sin skills.

```http
POST /v1/skills/extract        [auth]
```
Extracción aislada, para el "previsualizar antes de guardar".
Body `{ text }` → `200 { skills: [{ slug, label, category, confidence }] }`

```http
GET /v1/skills
```
Vocabulario canónico completo. El frontend lo cachea y lo usa en el autocompletado.
→ `200 { skills: [{ slug, label, category }] }`

### Ideas

```http
POST /v1/ideas                 [auth]   { title, summary }
GET  /v1/ideas
POST /v1/ideas/:id/interest    [auth]   toggle INTERESTED_IN
```

### Equipos

```http
POST  /v1/teams                [auth]
PATCH /v1/teams/:id            [auth: líder]
PUT   /v1/teams/:id/needs      [auth: líder]
GET   /v1/teams/:id
GET   /v1/teams                          ?status=recruiting
```

`POST /v1/teams`:
```jsonc
{
  "name": "Health AI",
  "pitch": "Asistente de triaje para clínicas rurales",
  "ideaId": "idea_01J...",              // opcional
  "needs": [
    { "slug": "go",     "priority": "required" },
    { "slug": "figma",  "priority": "nice" }
  ]
}
```
→ `201 { team }` · en una transacción crea el nodo, `LEADS`, `MEMBER_OF` y las aristas `NEEDS`; luego publica `team.created` y **encola el matchmaker**. `TeamDTO` ya incluye `needs` y `members`, así que no viajan como campos aparte ([09](09-contracts.md)).

`PUT /v1/teams/:id/needs` reemplaza el conjunto completo de needs (no es un parche). Publica `team.updated` y vuelve a encolar el matchmaker — es el disparador del caso de uso principal.

### Solicitudes

```http
POST /v1/teams/:id/applications        [auth]   { message? }
POST /v1/applications/:id/resolve      [auth: líder]   { action: 'accept'|'reject' }
POST /v1/applications/:id/withdraw     [auth: solicitante]
GET  /v1/teams/:id/applications        [auth: líder]
```

Crear una solicitud cambia el claim `teams` del solicitante, que pasa a `applicant` en ese equipo. El token que tiene en memoria no lo refleja, así que el cliente reinvoca su callback tras el `201` si quiere leer `team-{id}` sin esperar al refresco ([03](03-portal-contract.md)).

`resolve` con `accept` ejecuta el invariante 5 completo en una transacción:
crea `MEMBER_OF` → `person.status = 'teamed'` → recalcula `team.status` → `auto_reject` de las demás `pending` de esa persona → invalida sugerencias vivas de esa persona.

Publica `team.member_joined` en `network-main` y `application.resolved` en `team-{id}`.

### Webhook de Portal

```http
POST /v1/portal/webhooks
```
Sin auth de sesión. Verifica HMAC-SHA256 del header `portal-signature` **antes** de parsear el body.

```ts
// Orden obligatorio. Nunca al revés.
if (!verifyHmac(rawBody, req.header('portal-signature'), env.PORTAL_WEBHOOK_SECRET))
  return c.json({ error: 'INVALID_SIGNATURE' }, 401);

const evt = JSON.parse(rawBody);

// Guardarraíl anti-bucle. Sin esto el agente se retroalimenta. Ver ADR-004.
if (evt.data?.senderId === 'agent:matchmaker') return c.body(null, 204);

// Idempotencia: la entrega es at-least-once.
const fresh = await markProcessed(evt.id);   // insert ... on conflict do nothing
if (!fresh) return c.body(null, 204);

await handle(evt);
return c.body(null, 204);                     // 2xx siempre que se aceptó
```

Camino secundario ([ADR-004](01-decisions.md)): el matchmaker se dispara en proceso. Este receptor existe como red de seguridad ante eventos publicados fuera del flujo REST.

## Errores

Forma única:

```jsonc
{ "error": "TEAM_FULL", "message": "El equipo ya tiene 4 integrantes.", "details": {} }
```

| Código | HTTP | Cuándo |
|---|---|---|
| `UNAUTHENTICATED` | 401 | falta o es inválido el `sessionToken` |
| `FORBIDDEN` | 403 | no eres el líder / no es tu perfil |
| `NOT_FOUND` | 404 | |
| `HANDLE_TAKEN` | 409 | handle duplicado |
| `TEAM_FULL` | 409 | invariante 2 |
| `ALREADY_IN_TEAM` | 409 | invariante 1 |
| `DUPLICATE_APPLICATION` | 409 | invariante 4 — devuelve la existente en `details` |
| `UNKNOWN_SKILL` | 422 | invariante 6 |
| `VALIDATION_ERROR` | 422 | Zod, con `details.issues` |
| `RATE_LIMITED` | 429 | 60 req/min por sesión |

## Regla de publicación

Ningún handler publica a Portal dentro de la transacción de DB.

```
1. transacción: escribir en Postgres
2. commit
3. construir el sobre desde el estado ya comprometido
4. publicar a Portal  (si falla → insertar en outbox, no revertir)
5. encolar matchmaker si aplica
```

Publicar antes del commit produce un sobre que anuncia un estado que puede no existir. Es el fallo más difícil de detectar en ejecución.
