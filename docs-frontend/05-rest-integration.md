# 05 — Integración REST

> Qué endpoints del backend consume cada pantalla/acción. La referencia completa de la API está en [05-rest-api](../docs/05-rest-api.md). Aquí se mapea endpoint → componente → momento del flujo.

## Principio

La API REST es para **escritura y arranque**. El estado en vivo llega por Portal. El frontend solo hace `GET` para snapshots y detalles bajo demanda; las mutaciones van por `POST/PATCH/PUT` y el resultado se confirma cuando llega el sobre por el canal.

## Configuración del cliente HTTP

```ts
// src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL;

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useSessionStore.getState().sessionToken;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json();  // ApiError de @nodo/contracts
    throw new ApiRequestError(res.status, error);
  }
  return res.json();
}
```

Todos los tipos de request y response vienen de `@nodo/contracts`. No se definen tipos locales para la API.

## Mapa endpoint → pantalla/componente

### Sesión e identidad

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `POST /v1/session` | `OnboardingPage` | Primera visita (no hay sessionToken) | Respuesta guardada en localStorage. Muestra `recoveryCode` una vez. |
| `POST /v1/portal/token` | `PortalProvider` (callback `authToken`) | Conexión, reconexión, cada 15 min | Nunca se guarda el JWT. El callback lo devuelve fresco. |

### Grafo

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `GET /v1/graph` | `AppBootstrap` (wrapper de inicialización) | Al arrancar la app, tras reconexión con hueco de `seq` | Carga el snapshot en el `GraphStore`. Es público, sin auth. |

### Personas

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `POST /v1/people` | `ProfileForm` (onboarding) | Al completar el formulario de perfil | Crea el perfil. Si incluye `bioRaw` sin skills, el backend extrae skills síncronamente (~1.5s). |
| `PATCH /v1/people/:id` | `EditProfileModal` | Al guardar cambios en el perfil | Solo el propio. |
| `PUT /v1/people/:id/status` | `StatusToggle` | Al cambiar disponibilidad (looking ↔ idle) | |
| `GET /v1/people/:id` | `ProfilePage` | Al abrir el detalle de una persona | Detalle público. |

### Skills

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `GET /v1/skills` | `SkillPicker` | Al montar (cacheado en memoria toda la sesión) | Vocabulario canónico para autocompletado. |
| `POST /v1/skills/extract` | `ProfileForm` | Al hacer blur en el campo `bioRaw` o click en "Analizar" | Preview de skills antes de guardar. |

### Ideas

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `POST /v1/ideas` | `PublishIdeaModal` | Al enviar el formulario de nueva idea | |
| `GET /v1/ideas` | No se usa directamente | — | Las ideas se derivan del grafo (`kind === 'idea'`). Este endpoint es para búsqueda/filtrado si se necesita. |
| `POST /v1/ideas/:id/interest` | `InterestedButton` | Toggle de interés en una idea | |

### Equipos

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `POST /v1/teams` | `CreateTeamModal` | Al crear equipo | Incluye `needs` inicial. |
| `PATCH /v1/teams/:id` | `TeamPage` (líder) | Al editar nombre/pitch | |
| `PUT /v1/teams/:id/needs` | `EditNeedsForm` | Al actualizar necesidades | Reemplaza el conjunto completo de needs. |
| `GET /v1/teams/:id` | `TeamPage` | Al abrir detalle de equipo | Para datos que no están en el grafo (pitch completo, etc.). |
| `GET /v1/teams?status=recruiting` | No se usa | — | Los equipos se filtran del grafo por `status`. |

### Solicitudes

| Endpoint | Componente | Cuándo | Notas |
|---|---|---|---|
| `POST /v1/teams/:id/applications` | `ApplyButton` + `ApplicationMessage` | Al solicitar unirse a un equipo | **Excepción:** la respuesta se usa directamente para poblar `TeamStore.myApplication` (no espera el sobre de Portal). |
| `POST /v1/applications/:id/resolve` | `ApplicationCard` (botones) | Líder acepta o rechaza | `{ action: 'accept' | 'reject' }` |
| `POST /v1/applications/:id/withdraw` | `MyApplicationStatus` | El solicitante retira su solicitud | |
| `GET /v1/teams/:id/applications` | `ApplicationsPanel` | Al montar el panel del líder | Lista de solicitudes pendientes. Solo accesible para el líder. |
| `GET /v1/me/application` (**pendiente**) | `ApplyButton` / `AppBootstrap` | Al arrancar o refresh de página | Rehidrata `TeamStore.myApplication`. **Ver pregunta pendiente para el backend.** |

## Manejo de errores por endpoint

| Error | HTTP | Componente | Comportamiento en UI |
|---|---|---|---|
| `HANDLE_TAKEN` | 409 | `ProfileForm` | Mostrar inline: "Este handle ya está en uso" |
| `TEAM_FULL` | 409 | `ApplicationCard` (aceptar) | Toast de error: "El equipo ya está completo" |
| `ALREADY_IN_TEAM` | 409 | `ApplyButton` | Deshabilitar botón + tooltip explicativo |
| `DUPLICATE_APPLICATION` | 409 | `ApplyButton` | Mostrar estado de la solicitud existente (viene en `details.application`) |
| `UNKNOWN_SKILL` | 422 | `SkillPicker` | No debería pasar si se usa el vocabulario; fallback: filtrar el skill del envío |
| `VALIDATION_ERROR` | 422 | Cualquier formulario | Mapear `details.issues` a errores inline por campo |
| `UNAUTHENTICATED` | 401 | Global (interceptor) | Redirigir a onboarding (sesión perdida/expirada) |
| `FORBIDDEN` | 403 | Acciones de líder | Toast: "No tienes permisos para esta acción" |
| `NOT_FOUND` | 404 | Páginas de detalle | Mostrar `EmptyState` con mensaje |
| `RATE_LIMITED` | 429 | Global (interceptor) | Toast: "Demasiadas solicitudes, espera un momento" |

## Flujo de escritura → confirmación

Toda mutación sigue este patrón:

```
1. Usuario hace click (ej. "Crear equipo")
2. UI entra en estado loading (botón disabled, spinner)
3. POST /v1/teams → 201
4. UI quita el spinner, cierra el modal
5. (Backend publica a Portal tras commit)
6. Sobre llega por network-main con GraphPatch
7. Store aplica el parche → UI refleja el equipo nuevo
```

**El paso 4 NO actualiza el grafo.** El frontend espera el sobre de Portal (paso 6-7) para actualizar el estado. Esto garantiza que todos los clientes ven el mismo estado y que la respuesta REST no necesita llevar un `GraphPatch` duplicado.

**Excepción 1:** la respuesta de `POST /v1/people` (perfil propio) se usa para actualizar `SessionStore.profile` inmediatamente, porque el usuario necesita ver su propio perfil antes de que el sobre llegue (y además el usuario aún no está suscrito al canal en ese momento).

**Excepción 2:** la respuesta de `POST /v1/teams/:id/applications` se usa para poblar `TeamStore.myApplication` inmediatamente, sin esperar el sobre de Portal. Razón: el solicitante aún no está suscrito a `team-{teamId}` en el momento de crear la solicitud (la suscripción ocurre después), así que existe una ventana de carrera donde `application.created` se publica al canal antes de que el frontend se suscriba. Si no se usa la respuesta del POST directamente, `myApplication` nunca se llena y `ApplyButton` queda pegado en estado de carga.

> La suscripción a `team-{teamId}` se establece después del POST exitoso. Sirve para recibir la **resolución** (`application.resolved`) pero no para confirmar la creación.

> ⚠️ **PREGUNTA PENDIENTE PARA EL BACKEND**
>
> No existe un endpoint que permita al **solicitante** recuperar el estado de su propia solicitud activa tras un refresh de página. `GET /v1/teams/:id/applications` es exclusivo del líder.
>
> **Se necesita** algo como `GET /v1/people/:id/application` o `GET /v1/me/application` que devuelva la `ApplicationDTO` activa de la persona autenticada (si existe). Sin esto, `TeamStore.myApplication` se pierde en cada refresh y el `ApplyButton` vuelve al estado "Solicitar unirme" aunque ya haya una solicitud pendiente.
>
> **Workaround temporal (si el backend no lo implementa a tiempo):** guardar `myApplication` en `localStorage` como caché local. Es frágil (se desincroniza si la solicitud se resuelve mientras la app está cerrada), pero es mejor que nada para la demo. Al reconectar, si el caché dice "pendiente" y la persona ya está `teamed` (visible en el grafo), se descarta el caché.

## Caché y revalidación

| Recurso | Estrategia | Invalidación |
|---|---|---|
| `GET /v1/skills` | Cache en memoria (todo el vocabulario, ~70 items) | Nunca (no cambia en runtime) |
| `GET /v1/graph` | No se cachea (se pide fresh cada vez) | N/A |
| `GET /v1/people/:id` | Cache por sesión. Solo para campos que no viven en el grafo (`bio`, `headline`, `availability`, `language`). | Invalidar al recibir `person.upserted`. |
| `GET /v1/teams/:id` | Cache por sesión, invalidar al recibir `team.*` | Sobre de Portal |
| `GET /v1/teams/:id/applications` | No se cachea (datos sensibles, pocos items) | Canal `team-{id}` |

**Regla de status para ProfilePage:** `ProfilePage` NO lee `status` del objeto cacheado de `GET /v1/people/:id`. Lo lee siempre de `GraphStore.nodes.get(id).status`, que se actualiza tanto con `person.upserted` como con `person.status_changed`. Esto evita el bug recurrente de status desincronizado (mismo patrón que se resolvió en PresenceStore — documento 02).

> **Patrón general:** cualquier dato que viva en `GraphNode` (`status`, `label`) debe leerse del `GraphStore`, no de un caché REST. El caché REST se usa solo para campos que no están en el grafo (bio, headline, etc.).

No se usa una librería de caché como React Query o SWR. Para un MVP con datos en tiempo real vía Portal, el cache manual es suficiente y evita conflictos entre el caché de la librería y las actualizaciones de Portal.
