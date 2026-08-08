# Tasks — Plan de implementación frontend

> Tareas ordenadas por dependencia. Cada tarea es ejecutable en una sesión corta de hackathon.
> Referencia: `docs-frontend/` (01 a 08) + `criterios-aceptacion-backend.md`.

---

## Fase 0 — Scaffolding y configuración

### T-001: Scaffold del proyecto React + Vite + TypeScript

**Docs:** 01-decisions (ADR-F-001), 07-architecture  
**Entregable:** proyecto Vite inicializado con `pnpm`, TypeScript `strict: true`, Tailwind configurado, estructura de carpetas base (`lib/`, `stores/`, `hooks/`, `components/`, `pages/`, `types/`).  
**Incluye:** `.env.example` con `VITE_PORTAL_PUBLIC_KEY` y `VITE_API_URL`.

---

### T-002: Integrar `@nodo/contracts` como workspace package

**Docs:** 01-decisions (ADR-F-001), 07-architecture  
**Entregable:** `pnpm` workspace configurado para que el frontend importe `@nodo/contracts` directamente. Verificar que los tipos (`GraphNode`, `GraphEdge`, `GraphPatch`, `Envelope`, DTOs) se importan sin error de compilación.  
**Nota:** si el backend aún no ha publicado el paquete, crear un symlink temporal o copiar los tipos como paso intermedio.

---

### T-003: Configurar Vitest + Testing Library + MSW

**Docs:** 08-testing  
**Entregable:** `vitest.config.ts`, setup de Testing Library, setup de MSW (handlers base vacíos), script `pnpm test` funcional con un test placeholder que pase.

---

## Fase 1 — Stores (estado global)

### T-004: Implementar `graphStore` con `applyPatch` (shallow merge) y `loadSnapshot`

**Docs:** 02-state-model, 03-portal-integration (sección "Algoritmo de aplicación")  
**AC:** AC-06 (reconexión), base de AC-02/AC-04  
**Entregable:**
- Store Zustand con `Map<string, GraphNode>`, `Map<string, GraphEdge>`, `lastSeq`.
- `loadSnapshot(snapshot)`: reemplaza el store completo.
- `applyPatch(patch)`: **shallow merge** para upsert de nodos/aristas (`{ ...existente, ...parche }`), delete para `removeNodes`/`removeEdges` (eliminando aristas huérfanas al borrar un nodo).

> ⚠️ **PREGUNTA PENDIENTE BACKEND:** ¿`GraphPatch.nodes` siempre viene con el `GraphNode` completo, o puede venir parcial (solo campos que cambiaron)? La implementación con shallow merge es correcta en ambos casos. Si se confirma que siempre es completo, se puede simplificar a replace más adelante — pero no es bloqueante.

---

### T-005: Tests de `applyPatch` — idempotencia, shallow merge, removeNodes/Edges

**Docs:** 08-testing (sección "Pruebas del store — GraphPatch")  
**AC:** AC-06 (el snapshot es correcto), base de AC-02/AC-04  
**Entregable:** suite completa de tests unitarios:
- Insertar nodos nuevos.
- Shallow merge: actualizar solo campos presentes sin borrar los existentes.
- Upsert con nodo completo: funciona igual que merge.
- Idempotencia: aplicar el mismo parche dos veces = mismo resultado.
- `removeNodes` elimina nodo + aristas asociadas.
- `removeEdges` elimina solo la arista indicada.

---

### T-006: Implementar selector `activeSuggestions` con filtro defensivo por status

**Docs:** 02-state-model (selector), 06-acceptance-criteria-mapping (AC-04)  
**AC:** AC-04 (sugerencias desaparecen al pasar a teamed)  
**Entregable:** selector que filtra:
- `kind === 'suggested'` && `transient === true`
- `expiresAt` no pasado (o ausente)
- **Filtro defensivo:** el nodo persona (`edge.from`) tiene `status === 'looking'`

> ⚠️ **PREGUNTA PENDIENTE BACKEND:** ¿El MatchMaker publica `match.expired` activamente al aceptar una solicitud, o solo expiran por tiempo? El filtro defensivo funciona en ambos casos. Si se confirma que sí publica, el filtro es redundante pero no estorba.

---

### T-007: Test del filtro defensivo de `activeSuggestions`

**Docs:** 08-testing (AC-04, test "excluye sugerencias de persona que ya no está looking")  
**AC:** AC-04  
**Entregable:** test que verifica que `activeSuggestions` excluye una sugerencia cuando la persona pasa a `teamed` vía `applyPatch`, **sin** recibir `match.expired`.

---

### T-008: Implementar `feedStore`

**Docs:** 02-state-model  
**Entregable:** store con `lines: FeedLine[]`, `addLine` (unshift + slice 0-100), `clear()`.

---

### T-009: Implementar `presenceStore` (solo online/offline) con manejo de DetailedPresence vs AggregatePresence

**Docs:** 02-state-model (sección corregida), 03-portal-integration (Presence), PORTAL-API-REAL.md  
**Entregable:** store con `online: Set<string>`, `setOnline`, `setOffline`, `replaceAll`. **NO** lleva `status` de dominio.

**Manejo de presence.kind:**
- Si `presence.kind === 'detailed'`: poblar `online` con el roster completo de `participants`.
- Si `presence.kind === 'aggregate'`: el Set queda vacío (no hay roster). Solo se usa `presence.count` para el contador global. `OnlineIndicator` por persona se deshabilita.
- Verificar `presence.kind` al consumir — no asumir que siempre es detailed.

---

### T-010: Implementar `sessionStore`

**Docs:** 02-state-model, 01-decisions (ADR-F-007)  
**Entregable:** store con `personId`, `sessionToken`, `profile`, persistencia en `localStorage` (solo personId y sessionToken), `clearSession`.

---

### T-011: Implementar `teamStore`

**Docs:** 02-state-model, 05-rest-integration (Excepción 2)  
**AC:** AC-04  
**Entregable:** store con `myTeamId`, `applications`, `myApplication`. La acción `setMyApplication` se invoca directamente desde la respuesta del POST (no espera el sobre de Portal).

---

## Fase 2 — Capa de integración (Portal + REST)

### T-012: Implementar `lib/api.ts` — cliente HTTP tipado

**Docs:** 05-rest-integration (configuración del cliente HTTP)  
**Entregable:** wrapper de fetch con Bearer token automático, tipado con `@nodo/contracts`, manejo de `ApiError`.

---

### T-013: Implementar `lib/portal.ts` + `PortalProvider` con callback async de token

**Docs:** 03-portal-integration (inicialización del SDK), 01-decisions (ADR-F-003), PORTAL-API-REAL.md  
**AC:** AC-06 (reconexión automática)  
**Entregable:**
- `lib/portal.ts`: instanciar `const portal = new Portal({ apiKey: import.meta.env.VITE_PORTAL_PUBLIC_KEY })` a nivel de módulo.
- `fetchPortalToken` async que llama a `POST /v1/portal/token` con Bearer sessionToken.
- `<PortalProvider client={portal} token={fetchPortalToken}>` en `App.tsx`.
- `portal.setToken(fetchPortalToken)` al completar onboarding (pasar de anónimo a identificado sin remount).

---

### T-014: Implementar `usePortalChannel` — suscripción a `network-main` con verificación de `seq`

**Docs:** 03-portal-integration (canales, detección de huecos, flujo de datos), PORTAL-API-REAL.md  
**AC:** AC-06 (reconexión), AC-02/AC-03/AC-04 (recibir sobres)  
**Entregable:**
- Componente/hook que monta `useChannel<MainEvent>({ channelId: 'network-main', history: 50, onMessage: handler })`.
- El `onMessage` handler:
  - Verifica `msg.seq`: si `<= lastSeq` → ignorar; si `=== lastSeq + 1` → aplicar; si `> lastSeq + 1` → re-fetch snapshot.
  - Aplica `applyPatch(msg.content.graph)` — accede al GraphPatch dentro del content del Message.
  - Agrega `msg.content.summary` al `feedStore`.
- Sincroniza `status` del canal al `graphStore.connectionStatus`.
- **NO** deduplica por `envelope.id` — solo por `seq`.
- Montar el hook ES la suscripción (no hay `.subscribe()` aparte).

> ⚠️ **PREGUNTA PENDIENTE BACKEND:** ¿`envelope.id` se repite entre las dos fases de `match.suggested`? La deduplicación por `seq` funciona correctamente en ambos casos.

> **Nota sobre Message shape:** Portal expone `msg.content` como el payload genérico. Nuestros `Envelope<T,P>` viven dentro de `content`. Es decir: `msg.content.type`, `msg.content.graph`, `msg.content.summary`, etc. Si se confirma que son distintos `envelope.id`, no hay conflicto posible.

---

### T-015: Tests de detección de `seq` (duplicados, secuencia correcta, huecos)

**Docs:** 08-testing (sección "Tests de detección de seq")  
**AC:** AC-06  
**Entregable:** tres tests: acepta seq correcto, ignora duplicado, detecta hueco y dispara re-fetch.

---

### T-016: Implementar `useTeamChannel` — suscripción reactiva a `team-{teamId}`

**Docs:** 03-portal-integration (canal team-{teamId})  
**AC:** AC-04  
**Entregable:** hook que suscribe al canal del equipo, actualiza `teamStore.applications` con `application.created`/`application.resolved`.

**Suscripción reactiva:** el hook reacciona a `teamStore` observando tanto `myTeamId` como `myApplication?.teamId`:
- Se **suscribe** en cuanto cualquiera de los dos se puebla (ya sea por ser miembro o por tener una solicitud activa — lo segundo ocurre en T-034).
- Se **desuscribe** cuando ambos vuelven a `null` (equipo abandonado, solicitud resuelta sin nueva solicitud).
- Esto es necesario porque el solicitante necesita recibir `application.resolved` en vivo — sin esta suscripción, el único camino sería refrescar la página.

**Dependencias de coordinación:** T-011 (`teamStore`) y T-034 (`ApplyButton` pobla `myApplication`) deben estar implementados para que la suscripción del solicitante funcione end-to-end.

---

### T-017: Implementar secuencia de arranque (`AppBootstrap`)

**Docs:** 03-portal-integration (secuencia de arranque), 05-rest-integration  
**AC:** AC-06  
**Entregable:** componente/hook que ejecuta:
1. Verificar `sessionToken` en localStorage.
2. `GET /v1/graph` → `loadSnapshot()`.
3. Conectar Portal SDK.
4. Suscribir a `network-main`.

---

### T-018: Implementar `FakePortalProvider` para tests

**Docs:** 08-testing (sección "La costura: Fake Portal")  
**Entregable:** provider mock con `emit(channel, envelope)`, `setPresence(members)`, `addInboxItem(item)`. Los hooks del SDK consumen datos de este fake en tests.

---

## Fase 3 — Componentes base y layout

### T-019: Componentes base (Button, Card, Badge, Avatar, Modal, Spinner, EmptyState, ErrorBoundary)

**Docs:** 04-screens-and-components (sección "Componentes base reutilizables"), 01-decisions (ADR-F-005 Tailwind)  
**Entregable:** componentes con Tailwind, sin lógica de dominio.

---

### T-020: Layout principal (`MainLayout`, `Header`, `MarketplacePanel`, `MobileNav`, `ConnectionBanner`)

**Docs:** 04-screens-and-components (Layout), 01-decisions (ADR-F-008)  
**Entregable:** split de dos paneles en desktop, tabs en móvil, header con presence counter y notification bell.

---

### T-021: Routing con React Router

**Docs:** 04-screens-and-components (mapa de pantallas)  
**Entregable:** rutas configuradas (`/onboarding`, `/app`, `/app/profile/:id`, `/app/team/:id`, etc.), guards de sesión.

---

## Fase 4 — Grafo (react-force-graph)

### T-022: Implementar `useGraphData` — transformación store → `{ nodes, links }` con filtrado consistente

**Docs:** 04-screens-and-components (filtrado consistente), 01-decisions (ADR-F-004), 07-architecture  
**Entregable:** hook que transforma el `Map` del store al formato `{ nodes: [...], links: [...] }` de react-force-graph. **Filtra nodos y aristas atómicamente** (al excluir un tipo de nodo, excluye también aristas cuyos extremos apunten a nodos excluidos).

---

### T-023: Implementar `GraphPanel` con `nodeCanvasObject` y `linkCanvasObject`

**Docs:** 04-screens-and-components (panel de grafo, mapping de kinds, mapping de aristas)  
**AC:** AC-02 (arista suggested visible), AC-04 (arista MEMBER_OF visible)  
**Entregable:**
- `ForceGraph2D` con `graphData` del hook anterior.
- `nodeCanvasObject`: renderiza según kind (círculo/cuadrado/diamante/punto/estrella).
- `linkCanvasObject`: sólida para permanentes, **punteada+animada para `transient: true`** (suggested).
- `onNodeClick`: navegar al detalle.
- **`onLinkClick`**: abrir `SuggestionCard` si `edge.kind === 'suggested'`.
- `cooldownTicks` para detener simulación en reposo.

---

### T-024: Implementar `GraphControls` (filtros por tipo de nodo)

**Docs:** 04-screens-and-components (interacción, filtrado)  
**Entregable:** toggles por tipo de nodo que modifican los filtros de `useGraphData`.

---

### T-024b: Test de `useGraphData` — filtrado atómico sin aristas colgantes

**Docs:** 04-screens-and-components (filtrado consistente), 08-testing  
**Entregable:** test unitario que verifica:
- Al excluir un tipo de nodo (ej. `skill`), ninguna arista resultante tiene `from` o `to` apuntando a un nodo ausente en el subconjunto filtrado.
- Evita crash de react-force-graph-2d por referencias inválidas en vivo (ej. durante el pitch al tocar los filtros).

---

## Fase 5 — Onboarding y perfil

### T-025: Implementar `OnboardingPage` + `ProfileForm`

**Docs:** 04-screens-and-components (onboarding), 05-rest-integration (POST /v1/session, POST /v1/people)  
**AC:** AC-01 (extracción de skills)  
**Entregable:** flujo multi-step: bienvenida → formulario → preview → guardar → recovery code → redirect.

---

### T-026: Implementar `SkillPicker` + `SkillPreview`

**Docs:** 04-screens-and-components, 05-rest-integration (GET /v1/skills, POST /v1/skills/extract)  
**AC:** AC-01  
**Entregable:** autocompletado multiselect que solo ofrece slugs del vocabulario canónico. Preview de skills extraídos del bio.

---

### T-027: Implementar `ProfilePage` — lee status del GraphStore, no del caché REST

**Docs:** 04-screens-and-components (perfil), 05-rest-integration (caché corregido)  
**Entregable:** `ProfilePage` que usa `GET /v1/people/:id` solo para `bio`, `headline`, `availability`, `language`. Lee `status` siempre de `GraphStore.nodes.get(id).status`.

---

### T-028: Implementar `StatusToggle` + `EditProfileModal`

**Docs:** 04-screens-and-components, 05-rest-integration (PUT /v1/people/:id/status, PATCH /v1/people/:id)  
**Entregable:** toggle looking ↔ idle, modal de edición de perfil.

---

## Fase 6 — Marketplace

### T-029: Implementar `PeopleList` + `PersonCard` + `StatusBadge` + `OnlineIndicator`

**Docs:** 04-screens-and-components (sub-vista personas)  
**Entregable:** lista de personas con filtro toggle (default: looking), badges de status, indicador de presence.

---

### T-030: Implementar `TeamsList` + `TeamCard` + `TeamStatusBadge` + `NeedBadge`

**Docs:** 04-screens-and-components (sub-vista equipos)  
**Entregable:** lista de equipos con status, miembros (avatares), needs con indicación required/nice.

---

### T-031: Implementar `IdeasList` + `IdeaCard`

**Docs:** 04-screens-and-components (sub-vista ideas)  
**Entregable:** lista de ideas con autor, interesados, badge si tiene equipo.

---

### T-032: Implementar `ActivityFeed` + `FeedLine`

**Docs:** 04-screens-and-components (sub-vista feed), 02-state-model (FeedStore)  
**AC:** AC-02/AC-03 (actividad del agente en feed)  
**Entregable:** lista cronológica, cada línea con icono + texto + links a entidades (refs).

---

## Fase 7 — Equipos y solicitudes

### T-033: Implementar `TeamPage` + `TeamHeader` + `MembersList` + `NeedsList`

**Docs:** 04-screens-and-components (detalle de equipo)  
**Entregable:** vista de detalle con info del equipo, miembros actuales, necesidades.

---

### T-034: Implementar `ApplyButton` con 3 estados + poblado de `myApplication` desde REST

**Docs:** 04-screens-and-components (ApplyButton), 05-rest-integration (Excepción 2)  
**AC:** AC-04  
**Entregable:**
- 3 estados: sin solicitud → "Solicitar unirme"; pendiente → "Solicitud enviada" (deshabilitado); auto_rejected → mensaje + re-habilitado si el equipo sigue recruiting.
- **La respuesta del POST se usa directamente** para poblar `TeamStore.myApplication` (no espera sobre de Portal).
- Manejo de `DUPLICATE_APPLICATION` (409): usa `details.application` para poblar myApplication.

> ⚠️ **PREGUNTA PENDIENTE BACKEND:** ¿Existe o puede existir `GET /v1/me/application` para rehidratar `myApplication` en refresh de página? Sin esto, un F5 pierde el estado de la solicitud. Workaround temporal: persistir `myApplication` en `localStorage`.

---

### T-035: Tests de `ApplyButton` — flujo del solicitante

**Docs:** 08-testing (sección "Pruebas del flujo del solicitante")  
**AC:** AC-04  
**Entregable:**
- Test: tras POST exitoso, `teamStore.myApplication` se puebla antes de cualquier sobre de Portal.
- Test: 3 estados visuales según `myApplication`.
- Test: `DUPLICATE_APPLICATION` maneja correctamente.
- Test: `application.resolved` con status accepted actualiza al solicitante.

---

### T-036: Implementar `ApplicationsPanel` + `ApplicationCard` (vista del líder)

**Docs:** 04-screens-and-components (si es el líder), 05-rest-integration  
**AC:** AC-04, AC-05  
**Entregable:** lista de solicitudes pendientes, botones aceptar/rechazar, deshabilitación preventiva si equipo lleno.

---

### T-037: Implementar `EditNeedsForm`

**Docs:** 04-screens-and-components, 05-rest-integration (PUT /v1/teams/:id/needs)  
**AC:** AC-02 (disparador del matchmaker)  
**Entregable:** formulario que reemplaza el conjunto completo de needs con `SkillPicker` + selector de prioridad.

---

### T-038: Implementar `CreateTeamModal`

**Docs:** 04-screens-and-components (modales), 05-rest-integration (POST /v1/teams)  
**Entregable:** modal con formulario de nombre, pitch, idea opcional, needs iniciales.

---

## Fase 8 — Ideas

### T-039: Implementar `IdeaPage` + `InterestedButton` + `CreateTeamFromIdea`

**Docs:** 04-screens-and-components (detalle de idea)  
**Entregable:** vista de detalle, toggle de interés, botón para crear equipo desde idea.

---

### T-040: Implementar `PublishIdeaModal`

**Docs:** 04-screens-and-components (modales), 05-rest-integration (POST /v1/ideas)  
**Entregable:** modal con formulario de título y resumen.

---

## Fase 9 — Notificaciones y sugerencias

### T-041: Implementar `NotificationBell` + `NotificationsPage` + `NotificationItem`

**Docs:** 04-screens-and-components (notificaciones), 01-decisions (ADR-F-006)  
**AC:** AC-03 (inbox recibe sugerencia)  
**Entregable:** bell con badge `unseen`, página de inbox con items de Portal (`useInbox`), click navega a la entidad.

---

### T-042: Implementar `SuggestionCard` (modal de detalle de sugerencia)

**Docs:** 04-screens-and-components (modales)  
**AC:** AC-02, AC-03  
**Entregable:** modal con rationale, score, skills coincidentes, botón "Solicitar unirme" (que dispara el flujo de ApplyButton). Se abre desde feed, inbox, y click en arista `suggested` del grafo.

---

### T-043: Implementar toasts con `react-hot-toast` + `onItem` de Portal

**Docs:** 01-decisions (ADR-F-006), 03-portal-integration (inbox)  
**AC:** AC-03 (toast de sugerencia)  
**Entregable:** toast al recibir `InboxItem` nuevo. Fire-and-forget, no se persiste.

---

## Fase 10 — Reconexión y estados de error

### T-044: Implementar `ConnectionBanner` — mapeo de los 7 estados reales de Portal

**Docs:** 03-portal-integration (flujo visual durante reconexión), PORTAL-API-REAL.md  
**AC:** AC-06  
**Entregable:** banner que mapea los 7 estados reales del canal:
- `idle` / `connecting` → "Conectando..." (spinner).
- `ready` → banner oculto.
- `reconnecting` → "Reconectando..." (spinner).
- `degraded` → "Conexión inestable" (advertencia leve).
- `degraded-http` → "Conexión inestable — tus acciones siguen funcionando" (REST funciona).
- `blocked` → **"No se pudo conectar"** + acción contextual (NO spinner infinito, es terminal).
  - **Si la causa es `TokenExpiredError`** (sessionToken inválido/expirado): ofrecer ir a `RecoveryModal` o recrear sesión (onboarding). El problema es de identidad, no de red.
  - **Si la causa es otro** (ban, canal lleno, key inválida): mostrar error genérico con posibilidad de reintentar manualmente.

**Lógica de re-fetch post-reconexión:** tras transición `reconnecting → ready`, verificar si el primer `seq` indica gap no cubierto por el gap-fill automático de Portal → si sí, disparar `GET /v1/graph`.

---

### T-045: Test de integración de reconexión (AC-06 completo)

**Docs:** 08-testing (AC-06)  
**AC:** AC-06  
**Entregable:**
- Test: detecta hueco, pide GET /v1/graph, reemplaza store.
- Test: grafo idéntico al snapshot post-reconexión.
- Test: banner visible durante re-fetch, oculto al completar.

---

## Fase 11 — Tests de integración por AC

### T-046: Test de integración AC-02 (equipo encuentra persona)

**Docs:** 08-testing (AC-02), 06-acceptance-criteria-mapping  
**AC:** AC-02  
**Entregable:**
- Emitir `match.suggested` → arista transient en store + link en graphData.
- Doble publicación (mismo edge.id) → no duplica, rationale se actualiza.
- Feed muestra actividad del agente.

---

### T-047: Test de integración AC-03 (persona encuentra equipo)

**Docs:** 08-testing (AC-03), 06-acceptance-criteria-mapping  
**AC:** AC-03  
**Entregable:**
- Inbox recibe sugerencia.
- Toast se dispara.
- Feed público muestra la actividad.

---

### T-048: Test de integración AC-04 (aceptación en vivo)

**Docs:** 08-testing (AC-04), 06-acceptance-criteria-mapping  
**AC:** AC-04  
**Entregable:**
- `team.member_joined` → arista MEMBER_OF + status persona cambia.
- `match.expired` → sugerencias desaparecen (si el backend las publica).
- Filtro defensivo: sin `match.expired`, sugerencias igualmente no se muestran (por status).
- `application.resolved` → solicitante ve el cambio.

---

## Fase 12 — Expiración de sugerencias y limpieza

### T-049: Timer local de expiración cosmética de sugerencias

**Docs:** 03-portal-integration (manejo de expiración)  
**Entregable:** lógica que oculta aristas cuyo `expiresAt < Date.now()` sin esperar el sobre del servidor. Puede ser un `setInterval` que fuerza re-evaluación del selector, o simplemente el selector que ya filtra por `Date.now()` en cada render.

---

## Fase 13 — Pulido y demo

### T-050: MyTeamPage + redirección

**Docs:** 04-screens-and-components (Mi equipo)  
**Entregable:** redirige a `/app/team/:myTeamId` si existe, o muestra opciones (crear equipo / buscar equipo).

---

### T-051: RecoveryModal (restaurar sesión con código)

**Docs:** 04-screens-and-components (modales)  
**Entregable:** formulario para ingresar recovery code, llama a `POST /v1/session` con header `X-Recovery-Code`.

---

### T-052: Manejo global de errores (interceptor 401/429)

**Docs:** 05-rest-integration (manejo de errores)  
**Entregable:** interceptor en `lib/api.ts` que redirige a onboarding en 401, muestra toast en 429.

---

### T-053: Deploy del build estático + variables de entorno en producción

**Docs:** 07-architecture (sección Deploy), 01-decisions (ADR-F-001), PORTAL-API-REAL.md  
**Entregable:**
- `pnpm build` ejecuta sin errores.
- Desplegado en la plataforma elegida (Railway static site / Vercel / Netlify).
- `VITE_PORTAL_PUBLIC_KEY` y `VITE_API_URL` configuradas apuntando al backend real desplegado.
- Smoke test manual: login → ver grafo → presence → recibir un sobre en vivo contra la URL pública.

> ⚠️ **VERIFICAR ANTES DEL DEPLOY:** ¿Cómo se configuran los orígenes (CORS) permitidos en Portal? El comando `portal origins add` que mencionaba el backend NO existe en la CLI documentada (la CLI solo tiene `portal deploy` y `portal secrets set`). Posibilidades: dashboard web de Portal, configuración automática por API key, o un mecanismo no documentado. Si Portal bloquea conexiones desde orígenes no registrados, esto se descubre recién en producción. **Resolver antes de este paso.**

---

## Resumen de preguntas pendientes para el backend

Estas tareas tienen una anotación ⚠️ porque dependen de respuestas que aún no se tienen. **Ninguna es bloqueante** — las decisiones defensivas ya están tomadas y el código funciona en ambos escenarios posibles. Pero confirmarlas simplifica o elimina código defensivo:

| # | Pregunta | Tarea afectada | Decisión defensiva |
|---|---|---|---|
| 1 | ¿`GraphPatch.nodes` siempre viene completo? | T-004, T-005 | Shallow merge (funciona en ambos casos) |
| 2 | ¿`envelope.id` se repite entre las dos fases de `match.suggested`? | T-014 | Dedup solo por `seq` (funciona en ambos casos) |
| 3 | ¿El MatchMaker publica `match.expired` al aceptar una solicitud? | T-006, T-007, T-048 | Filtro defensivo por status de persona |
| 4 | ¿Existe `GET /v1/me/application` para el solicitante? | T-034 | Poblar desde respuesta del POST + localStorage como fallback |
| 5 | ¿A partir de cuántos participantes `network-main` pasa de DetailedPresence a AggregatePresence? | T-009, T-029 | Verificar `presence.kind` y mostrar solo contador global si es aggregate |
| 6 | ¿Cómo se configuran orígenes (CORS) en Portal? `portal origins add` no existe en la CLI. | T-053 | Verificar antes del deploy — posible dashboard o config automática |
