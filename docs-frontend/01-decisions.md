# 01 — Decisiones de arquitectura frontend (ADR)

## Stack

| Capa | Tecnología | Detalle | ADR |
|---|---|---|---|
| Framework | **React 18** | SPA, sin SSR | [F-001](#adr-f-001--react-con-vite) |
| Bundler | **Vite 5** | HMR instantáneo, builds rápidos | F-001 |
| Lenguaje | **TypeScript 5** | `strict: true`, mismo que backend | |
| Estado global | **Zustand** | store del grafo, sin boilerplate | [F-002](#adr-f-002--zustand-para-el-estado-del-grafo) |
| Tiempo real | **`@portalsdk/react`** | hooks nativos del SDK | [F-003](#adr-f-003--portal-sdk-como-única-capa-de-tiempo-real) |
| Visualización del grafo | **react-force-graph-2d** | d3-force, física integrada, read-only | [F-004](#adr-f-004--react-force-graph-para-el-grafo) |
| Estilos | **Tailwind CSS 3** | utility-first, consistente con hackathon speed | [F-005](#adr-f-005--tailwind-css) |
| HTTP | **fetch nativo** + wrapper tipado | sin axios; los tipos vienen de `@nodo/contracts` | |
| Routing | **React Router 6** | rutas planas, sin nesting complejo | |
| Notificaciones | **`useInbox`** de Portal + react-hot-toast | toasts efímeros sobre inbox persistente | [F-006](#adr-f-006--notificaciones-con-useinbox-y-toasts) |
| Contrato compartido | **`@nodo/contracts`** | importado del workspace pnpm | |

### Credenciales del lado cliente

| Variable | Dónde vive | Propósito |
|---|---|---|
| `VITE_PORTAL_PUBLIC_KEY` (`pk_`) | `.env`, expuesta al bundle | inicializar el SDK de Portal |
| `VITE_API_URL` | `.env` | base URL del backend REST |
| `sessionToken` | `localStorage` | autenticar contra la API REST |
| JWT de Portal | **solo en memoria** (callback) | autenticar contra Portal via SDK |

El `sessionToken` es la única credencial persistida en el navegador. El JWT de Portal nunca se guarda: se obtiene bajo demanda desde un callback `async`.

---

## Decisiones

---

## ADR-F-001 — React con Vite

**Estado:** cerrada

**Decisión.** React 18 con Vite como bundler. SPA sin server-side rendering.

**Por qué.**
- El backend ya declaró que el frontend es React + `@portalsdk/react` ([07-architecture](../docs/07-architecture.md)).
- La propuesta original mencionaba Angular, pero el paquete `@nodo/contracts` es TypeScript puro y el SDK de Portal ofrece bindings React. Dado que es un hackathon con plazo limitado y el contrato ya está cerrado, React con Vite minimiza la fricción de integración.
- Vite ofrece HMR sub-segundo y builds rápidos; ideal para iterar rápido durante la hackathon.
- No se necesita SSR: es una app interactiva en tiempo real, no una página indexable.

**Consecuencias.**
- Se usa `pnpm` como gestor de paquetes, igual que el backend, para compartir `@nodo/contracts` por workspace.
- El deploy es un build estático (HTML/JS/CSS) servido desde cualquier CDN o Railway static site.

---

## ADR-F-002 — Zustand para el estado del grafo

**Estado:** cerrada

**Decisión.** Un store Zustand contiene el grafo completo (nodos y aristas) más metadatos derivados (personas, equipos, ideas indexados por ID). El store expone acciones `applyPatch(patch: GraphPatch)` y `loadSnapshot(snapshot: GraphSnapshot)`.

**Por qué.**
- El grafo es la estructura de datos central del producto. Necesita actualizaciones inmutables frecuentes (cada sobre de Portal trae un `GraphPatch`) y lectura rápida desde múltiples componentes.
- Zustand es minimalista (~1 KB), no requiere providers ni boilerplate de reducers, y soporta selectores granulares para evitar re-renders innecesarios.
- Redux sería viable pero introduce demasiada ceremonia para un MVP. Context API causaría re-renders masivos al mutar el grafo.
- La acción `applyPatch` implementa la semántica de upsert idempotente por `id` que define el contrato ([03-portal-contract](../docs/03-portal-contract.md)).

**Consecuencias.**
- Todo componente que muestra datos del grafo (marketplace, panel visual, feed) lee del mismo store.
- El store es la fuente de verdad del lado cliente. Si hay un hueco de `seq`, se recarga desde `GET /v1/graph` y se reemplaza el store completo.
- Se necesita un mecanismo para detectar huecos de `seq` (ver [03-portal-integration](03-portal-integration.md)).

---

## ADR-F-003 — Portal SDK como única capa de tiempo real

**Estado:** cerrada

**Decisión.** Toda comunicación en tiempo real pasa exclusivamente por `@portalsdk/react`. El frontend no abre websockets propios ni usa polling.

**Por qué.**
- El contrato del backend ([03-portal-contract](../docs/03-portal-contract.md)) define que los clientes leen de canales Portal y emiten solo señales efímeras (typing, presence). No hay otro path de lectura en vivo.
- El SDK ya provee hooks para canales (`useChannel`), presence, inbox (`useInbox`), y reconexión automática.
- Usar una abstracción propia sobre websockets no aporta valor y duplica lógica de reconexión que Portal ya resuelve.

**Consecuencias.**
- El token de Portal se obtiene vía callback `async` que llama a `POST /v1/portal/token`. Nunca se pasa como string estático.
- La detección de huecos de `seq` se implementa en el handler de mensajes del canal, no en el SDK.
- Si Portal tiene una caída, el frontend queda sin actualizaciones en vivo pero el snapshot REST sigue disponible.

---

## ADR-F-004 — react-force-graph para el grafo

**Estado:** cerrada

**Decisión.** `react-force-graph-2d` (wrapper React de [force-graph](https://github.com/vasturiano/force-graph), basado en d3-force) para renderizar la visualización del grafo de la red.

**Por qué.**

El caso de uso es un **grafo social de solo lectura con física integrada**: nodos que se repelen, aristas que los atraen, y el grafo "respira" orgánicamente cuando alguien se une o una sugerencia aparece. No es un editor de flujo donde el usuario arrastra nodos para conectarlos.

### Comparación directa

| Criterio | react-force-graph | React Flow |
|---|---|---|
| **Modelo mental** | Grafo de red / social graph | Editor de flujo (n8n, Zapier) |
| **Layout automático** | Built-in (d3-force, sin dependencias extra) | Requiere dagre o elkjs aparte |
| **Física / animaciones** | Nativa: nodos se acomodan solos, la red "respira" | No trae simulación de fuerzas |
| **Interacciones por defecto** | Zoom, pan, hover, click (read-only natural) | Drag de nodos, handles de conexión, edición (hay que desactivar lo que sobra) |
| **Nodos que aparecen/desaparecen** | El grafo se re-estabiliza con animación automática | Requiere recalcular posiciones manualmente |
| **Rendimiento con cientos de nodos** | Canvas: excelente hasta ~2000 nodos | SVG/HTML: bueno hasta ~500, luego se degrada |
| **Customización visual de nodos** | Callback de renderizado en Canvas (o modo HTML) | Componentes React nativos (JSX) |
| **Aristas custom (punteadas, animadas)** | Callback `linkCanvasObject` o CSS en modo HTML | Componentes de arista declarativos |
| **Integración con React/Zustand** | El componente acepta `graphData` como prop reactiva | Requiere convertir a nodos/aristas de React Flow |
| **Tiempo de setup para nuestro caso** | Mínimo: pasar datos, funciona | Alto: layout externo + desactivar edición + calcular posiciones |

### Alternativas descartadas

- **React Flow**: diseñado para editores de flujo. Para nuestro caso obliga a integrar una librería de layout aparte, desactivar handles, drag-to-connect y otras interacciones de edición que vienen habilitadas por defecto. Más tiempo de configuración, no menos.
- **D3.js directo**: máximo poder, pero no es declarativo con React. Requiere un ref + bindeo manual del DOM. Más código custom del que se justifica en un hackathon.
- **Cytoscape.js**: potente para análisis de grafos, pero la integración con React es mediante wrappers no oficiales, y la estética por defecto es inferior.
- **vis-network**: similar a Cytoscape, menos mantenido, menos documentación.

**Consecuencias.**
- El componente recibe `graphData: { nodes: [...], links: [...] }` derivado del store Zustand. Un cambio en el store = la física se re-estabiliza con animación.
- Los nodos se renderizan con un callback `nodeCanvasObject` que pinta según `node.kind` (colores, formas, iconos). Para mayor flexibilidad se puede usar el modo `nodeThreeObject` (3D) o alternar a `react-force-graph-2d` con `nodeCanvasObject`.
- Las aristas `transient: true` (sugerencias del MatchMaker) se dibujan con dash pattern y color diferenciado vía `linkCanvasObjectMode` + `linkCanvasObject`.
- Click en nodo → navegar al detalle de la entidad.
- Hover en nodo → resaltar conexiones directas (highlight neighbors).
- El grafo es read-only: no hay drag-to-connect ni creación de aristas. Solo zoom, pan y reposicionar nodos arrastrándolos (esto sí es deseable para que el usuario explore).
- Si el volumen de nodos supera lo visualmente útil, se filtra por tipo (toggle checkboxes) en el lado del dato, no del renderizado.

---

## ADR-F-005 — Tailwind CSS

**Estado:** cerrada

**Decisión.** Tailwind CSS 3 para estilos, sin librería de componentes UI prearmada (no Chakra, no MUI).

**Por qué.**
- Velocidad de prototipado: en una hackathon, Tailwind permite estilizar sin salir del JSX.
- No se necesita un sistema de diseño completo ni componentes complejos (modals, drawers). Con utility classes y unos pocos componentes propios alcanza.
- Menor bundle que una librería de componentes.
- El equipo ya conoce Tailwind.

**Consecuencias.**
- Se crean componentes base propios (Button, Card, Badge, Modal) con Tailwind.
- La paleta de colores se define en `tailwind.config.ts` para mantener consistencia visual.
- Si se necesitan componentes más complejos (selects, comboboxes), se puede añadir Headless UI (compatible con Tailwind) de forma incremental.

---

## ADR-F-006 — Notificaciones con useInbox y toasts

**Estado:** cerrada

**Decisión.** Las notificaciones persistentes se consumen del inbox nativo de Portal vía `useInbox`. Las notificaciones efímeras (nuevos eventos que llegan mientras la app está abierta) se muestran como toasts con react-hot-toast.

**Por qué.**
- El backend ya configura `notify` en `portal.config.ts` para generar `InboxItem` a partir de mensajes de dominio ([ADR-008 del backend](../docs/01-decisions.md#adr-008--notificaciones-con-el-bridge-notify)). El frontend no necesita construir nada: solo consume `useInbox`.
- `useInbox` provee `items`, `unseen`, `markAllRead()`, `item.markAsRead()` y `onItem` (solo para ítems que llegan después del montaje, apto para toasts sin deduplicar).
- react-hot-toast es ligero y se conecta directamente al `onItem` de Portal.

**Consecuencias.**
- El badge de notificaciones no leídas usa `unseen` directamente.
- Al hacer click en una notificación, se navega a la entidad referenciada (equipo, persona, sugerencia).
- Los toasts son fire-and-forget: no se persisten localmente.

---

## ADR-F-007 — Autenticación sin contraseña, manejada por sessionToken

**Estado:** cerrada

**Decisión.** El frontend crea la sesión con `POST /v1/session`, guarda `personId` y `sessionToken` en `localStorage`, y usa el token como `Bearer` en todas las llamadas REST. Para Portal, pasa un callback `async` que llama a `POST /v1/portal/token` y devuelve el JWT fresco.

**Por qué.**
- Es exactamente el mecanismo que define el backend ([ADR-006](../docs/01-decisions.md#adr-006--identidad-sin-contraseñas)). No hay alternativa: el contrato está cerrado.
- El JWT de Portal tiene vida de 15 min. Pasar un string fijo causaría `TokenExpiredError`. El callback se reinvoca automáticamente en conexión, reconexión y expiración.

**Consecuencias.**
- Si `localStorage` se pierde, se pierde la identidad. Se ofrece el `recoveryCode` (mostrado una vez al crear la sesión).
- El frontend muestra un flujo de onboarding (crear perfil) la primera vez, y luego re-usa la sesión guardada.
- En reconexión, el SDK de Portal reinvoca el callback; el frontend no necesita lógica de refresh propia.

---

## ADR-F-008 — Layout de dos paneles (Marketplace + Grafo)

**Estado:** cerrada

**Decisión.** La pantalla principal se divide en dos paneles: izquierdo (marketplace: personas, ideas, equipos, feed) y derecho (visualización del grafo en vivo). En móvil se colapsa a tabs.

**Por qué.**
- Es el diseño descrito en la propuesta ([propuesta.md](../propuesta.md)): "dividir la pantalla en dos partes".
- El grafo complementa al marketplace sin reemplazarlo: uno es navegable/filtrable, el otro es una representación visual del estado global.
- En hackathons, el impacto visual de un grafo que se mueve en vivo es un diferenciador para el pitch.

**Consecuencias.**
- En desktop (≥1024px): split horizontal. Proporción configurable (60/40 o 50/50).
- En tablet (768-1023px): split con grafo colapsable.
- En móvil (<768px): tabs (Marketplace | Grafo | Actividad).
- El feed de actividad vive dentro del marketplace o como tab separado en móvil.
