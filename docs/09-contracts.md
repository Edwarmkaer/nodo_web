# 09 — Contratos compartidos (`@nodo/contracts`)

Paquete TypeScript que importan **el backend y el frontend**. Es la definición ejecutable de [03](03-portal-contract.md) y [05](05-rest-api.md): si un tipo no está aquí, no forma parte del contrato.

Los tipos se derivan de esquemas Zod, no se escriben dos veces:

```ts
export const PersonDTO = z.object({ /* … */ });
export type  PersonDTO = z.infer<typeof PersonDTO>;
```

El backend valida con el esquema en el borde; el frontend usa el tipo. Una sola fuente.

## Convenciones

| Regla | Detalle |
|---|---|
| Identificadores | `string` con prefijo por tipo: `per_`, `tm_`, `idea_`, `app_`, `sug_` |
| Fechas | `number`, epoch en milisegundos. Nunca `Date` ni ISO string |
| Nombres de campo | `camelCase` en el contrato, aunque la columna sea `snake_case` |
| Campos opcionales | `?` solo cuando la ausencia es semántica, no cuando el valor puede ser vacío |

## Regla de exposición

Tres campos existen en la base de datos y **nunca** aparecen en un DTO:

| Campo | Motivo |
|---|---|
| `session_token` | credencial de sesión |
| `recovery_code` | permite recuperar una identidad |
| `bio_raw` sin procesar de terceros | se expone como `bio`, y solo en el perfil propio o público según lo publique la persona |

El backend construye los DTO con un mapeador explícito. No serializa filas de base de datos directamente: una columna nueva no debe filtrarse al contrato por omisión.

## Referencias ligeras

Aparecen embebidas dentro de otros DTO cuando solo hace falta identificar y mostrar.

```ts
export type PersonRef = {
  id: string;
  handle: string;
  displayName: string;
};

export type TeamRef = {
  id: string;
  name: string;
};

export type SkillRef = {
  slug: string;
  label: string;
  category: SkillCategory;
};

export type SkillCategory =
  | 'frontend' | 'backend' | 'mobile' | 'data-ai'
  | 'design'   | 'product' | 'infra'  | 'other';
```

Dos especializaciones de `SkillRef`, una por cada arista que lo referencia:

```ts
/** Arista HAS_SKILL: qué sabe una persona y con qué profundidad. */
export type PersonSkill = SkillRef & {
  level: 1 | 2 | 3;
};

/** Arista NEEDS: qué le falta a un equipo y con qué prioridad. */
export type NeedRef = SkillRef & {
  priority: 'required' | 'nice';
};
```

## DTOs de dominio

### PersonDTO

```ts
export type PersonStatus = 'looking' | 'teamed' | 'idle';
export type Availability = 'full' | 'partial' | 'evenings';

export type PersonDTO = {
  id: string;
  handle: string;
  displayName: string;
  headline: string | null;
  bio: string | null;              // texto libre que la persona escribió
  availability: Availability;
  language: string;                // ISO 639-1: 'es', 'en'
  status: PersonStatus;
  teamId: string | null;           // MEMBER_OF materializado
  createdAt: number;
};
```

### TeamDTO

```ts
export type TeamStatus = 'recruiting' | 'almost_full' | 'complete' | 'building';

export type TeamDTO = {
  id: string;
  name: string;
  pitch: string | null;
  status: TeamStatus;              // derivado salvo 'building' (ver 02)
  lead: PersonRef;
  members: PersonRef[];            // acotado por maxSize
  needs: NeedRef[];
  ideaId: string | null;
  maxSize: number;                 // por defecto 4
  createdAt: number;
};
```

`members` viaja completo porque `maxSize` lo acota a un máximo de 4 elementos. `lead` está siempre incluido en `members` ([invariante 3](02-domain-model.md#invariantes)).

### IdeaDTO

```ts
export type IdeaDTO = {
  id: string;
  title: string;
  summary: string | null;
  author: PersonRef;
  teamId: string | null;           // arista SPAWNED, si ya derivó en equipo
  interestedCount: number;
  createdAt: number;
};
```

### ApplicationDTO

```ts
export type ApplicationStatus =
  | 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'auto_rejected';

export type ApplicationDTO = {
  id: string;
  person: PersonRef;
  teamId: string;
  teamName: string;
  leadId: string;                  // requerido por el bridge notify
  status: ApplicationStatus;
  message: string | null;
  createdAt: number;
  resolvedAt: number | null;
};
```

### SuggestionDTO

```ts
export type SuggestionDirection = 'team_needs_person' | 'person_seeks_team';

export type SuggestionDTO = {
  id: string;
  personId: string;
  personName: string;              // requerido por el bridge notify
  teamId: string;
  teamName: string;                // requerido por el bridge notify
  score: number;
  direction: SuggestionDirection;
  matchedSkills: NeedRef[];
  rationale: string;
  expiresAt: number;
  createdAt: number;
};
```

## Por qué hay campos denormalizados

`ApplicationDTO.leadId`, `ApplicationDTO.teamName`, `SuggestionDTO.personName` y `SuggestionDTO.teamName` duplican información que ya está en otros nodos. No es un descuido.

El bridge `notify` de `portal.config.ts` ([ADR-008](01-decisions.md#adr-008--notificaciones-con-el-bridge-notify)) se ejecuta **dentro de Portal**, sin acceso a la base de datos. Solo puede leer el `content` del mensaje. Todo dato que determine el destinatario o el título de la notificación tiene que viajar en el propio sobre.

Quitar cualquiera de esos cuatro campos rompe las notificaciones en silencio: el mensaje se publica, `notify` devuelve `undefined` donde esperaba un nombre, y no llega nada al inbox.

## Payloads de mensaje

Union discriminada por `type`. El sobre base (`Envelope`, `ActorRef`, `FeedLine`, `GraphPatch`) está en [03](03-portal-contract.md).

```ts
export type MainEvent =
  | Envelope<'person.upserted',       { person: PersonDTO; skills: PersonSkill[] }>
  | Envelope<'person.status_changed', { personId: string; status: PersonStatus; previous: PersonStatus }>
  | Envelope<'idea.published',        { idea: IdeaDTO }>
  | Envelope<'team.created',          { team: TeamDTO }>
  | Envelope<'team.updated',          { team: TeamDTO }>
  | Envelope<'team.member_joined',    { teamId: string; person: PersonRef; status: TeamStatus }>
  | Envelope<'team.member_left',      { teamId: string; personId: string; status: TeamStatus }>
  | Envelope<'match.suggested',       { suggestion: SuggestionDTO }>
  | Envelope<'match.expired',         { suggestionId: string }>;

export type TeamEvent =
  | Envelope<'application.created',   { application: ApplicationDTO }>
  | Envelope<'application.resolved',  { application: ApplicationDTO }>
  | Envelope<'team.need_changed',     { teamId: string; needs: NeedRef[] }>;

export type AnyEvent = MainEvent | TeamEvent;
```

`team.created` y `team.updated` llevan el `TeamDTO` completo, que ya incluye `needs`. No hay un campo `needs` separado.

Los sobres de `TeamEvent` no llevan `graph`: no afectan al grafo público ([03](03-portal-contract.md)).

## Respuestas REST

```ts
export type SessionResponse = {
  personId: string;
  sessionToken: string;
  recoveryCode: string;            // se muestra una vez, al crear la identidad
};

export type PortalTokenResponse = {
  token: string;
  expiresIn: number;               // segundos, 900
};

export type GraphSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  seq: number;
};

export type SkillsResponse = {
  skills: SkillRef[];
};

export type ExtractSkillsResponse = {
  skills: Array<SkillRef & { confidence: number }>;
};
```

## Errores

```ts
export type ErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'HANDLE_TAKEN'    | 'TEAM_FULL' | 'ALREADY_IN_TEAM'
  | 'DUPLICATE_APPLICATION' | 'UNKNOWN_SKILL'
  | 'VALIDATION_ERROR' | 'RATE_LIMITED';

export type ApiError = {
  error: ErrorCode;
  message: string;                 // texto para persona usuaria, en español
  details?: Record<string, unknown>;
};
```

`DUPLICATE_APPLICATION` devuelve la solicitud existente en `details.application` ([invariante 4](02-domain-model.md#invariantes)).

## Estructura del paquete

```
packages/contracts/
  src/
    primitives.ts    PersonRef · TeamRef · SkillRef · PersonSkill · NeedRef · enums
    dto.ts           PersonDTO · TeamDTO · IdeaDTO · ApplicationDTO · SuggestionDTO
    graph.ts         GraphNode · GraphEdge · GraphPatch
    envelope.ts      Envelope · ActorRef · FeedLine
    events.ts        MainEvent · TeamEvent · AnyEvent
    rest.ts          respuestas REST · ApiError · ErrorCode
    index.ts
```

Se publica a un registro privado o se consume por workspace de pnpm. Lo relevante es que **backend y frontend importen la misma versión**: una copia manual de los tipos elimina la garantía que motivó [ADR-003](01-decisions.md#adr-003--backend-en-typescript-con-hono).

## Versionado

`Envelope.v` es `1`. Un cambio incompatible añade un `type` nuevo en lugar de modificar el existente. Añadir un campo opcional a un DTO es compatible; cambiar el tipo de uno existente o quitarlo, no.
