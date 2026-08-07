# 06 — Mapeo de criterios de aceptación

> Cada AC-01 a AC-06 mapeado al componente/flujo del frontend que lo implementa y cómo se verifica desde el lado cliente.

Los criterios de aceptación los define el backend ([criterios-aceptacion-backend.md](../criterios-aceptacion-backend.md)). El frontend tiene responsabilidades específicas para que cada AC se cumpla de extremo a extremo.

---

## AC-01 — Extracción de skills

> **Dado** que una persona escribe "Trabajo principalmente con Angular, Go y PostgreSQL"  
> **Cuando** guarda su perfil  
> **Entonces** recibe `HAS_SKILL` hacia angular, go, postgresql, frontend y backend, todos del vocabulario canónico  
> **Y** no se persiste ningún skill fuera del vocabulario.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Enviar `bioRaw` al backend** | `ProfileForm` envía `POST /v1/people` con el campo `bioRaw` (y opcionalmente `skills` manual). |
| **Preview antes de guardar** | `POST /v1/skills/extract` al blur del textarea de bio → muestra `SkillPreview` con badges de los skills detectados (incluye `confidence`). |
| **Autocompletado de skills manuales** | `SkillPicker` solo ofrece slugs de `GET /v1/skills`. Imposible seleccionar un skill fuera del vocabulario. |
| **Visualizar resultado** | Al recibir el sobre `person.upserted` por Portal, el `GraphPatch` incluye nodo `person` + aristas `has_skill`. El grafo muestra las conexiones persona→skill. |

### Verificación frontend

- [ ] El formulario envía `bioRaw` correctamente.
- [ ] El preview muestra los skills extraídos antes de guardar.
- [ ] Tras guardar, las aristas `has_skill` aparecen en el grafo sin recargar.
- [ ] El `SkillPicker` no permite escribir slugs arbitrarios.

---

## AC-02 — El equipo encuentra a la persona

> **Dado** un Team Health AI con NEEDS = {go (required), figma (nice)}  
> **Y** una Person looking con HAS_SKILL = {go, postgresql}  
> **Cuando** el líder publica esa necesidad  
> **Entonces** en menos de 5 s el MatchMaker publica un match.suggested con esa persona  
> **Y** el rationale nombra go explícitamente  
> **Y** la arista aparece en el grafo de todos los clientes conectados sin recargar.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Publicar needs** | `EditNeedsForm` → `PUT /v1/teams/:id/needs` con skills y prioridades. |
| **Recibir sugerencia** | Handler de `network-main` recibe `match.suggested` → `applyPatch()` inserta arista `suggested` con `transient: true`. |
| **Visualizar arista** | `GraphPanel` (react-force-graph): la arista `suggested` con `transient: true` se renderiza punteada y animada vía `linkCanvasObject`. Aparece instantáneamente al aplicar el parche y la física la acomoda. |
| **Mostrar rationale** | `SuggestionCard` muestra `payload.suggestion.rationale`. Si llega la segunda fase (mismo `id`, rationale enriquecido), el texto se actualiza in-place. |
| **Feed** | `FeedLine` del sobre muestra "MatchMaker sugirió conectar a X con Y" con emoji 🔗. |
| **Idempotencia** | El upsert por `id` de arista garantiza que la doble publicación (plantilla → rationale real) no duplica la arista. |

### Verificación frontend

- [ ] Al publicar needs desde `EditNeedsForm`, el grafo muestra la arista `suggested` en ≤5s.
- [ ] La arista se renderiza como punteada y animada (vía `linkCanvasObject`).
- [ ] El rationale en `SuggestionCard` contiene el skill coincidente ("go").
- [ ] Al recibir el sobre por segunda vez (mismo `id`, rationale enriquecido), la arista no se duplica y el texto se actualiza.
- [ ] La línea del feed muestra la actividad del agente.

---

## AC-03 — La persona encuentra al equipo

> **Dado** que existe Health AI reclutando go  
> **Cuando** una Person nueva se registra con go  
> **Entonces** recibe una sugerencia hacia Health AI en su inbox  
> **Y** el mismo evento aparece en el feed público como actividad del agente.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Registro con skills** | `ProfileForm` → `POST /v1/people` con skills que incluyen `go`. |
| **Inbox** | `useInbox` de Portal recibe un `InboxItem` generado por el bridge `notify`. Aparece en `NotificationsPage` y activa el badge en `NotificationBell`. |
| **Toast** | `onItem` del hook dispara un toast: "MatchMaker te sugirió para Health AI". |
| **Feed público** | El sobre `match.suggested` llega por `network-main` a TODOS los clientes. `FeedLine` lo muestra. |
| **Grafo** | La arista `suggested` aparece en el grafo de todos los conectados. |

### Verificación frontend

- [ ] Al crear perfil con `go`, el inbox muestra una notificación de sugerencia.
- [ ] El toast se dispara al recibir el `InboxItem`.
- [ ] El feed muestra la actividad del agente para todos los clientes.
- [ ] La arista `suggested` aparece en el grafo global.

---

## AC-04 — Aceptación en vivo

> **Dado** una Application pending  
> **Cuando** el líder la acepta  
> **Entonces** el solicitante pasa a teamed Y el Team recalcula su status  
> **Y** todos los clientes ven aparecer la arista MEMBER_OF  
> **Y** las demás applications pendientes de esa persona quedan auto_rejected.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Aceptar** | `ApplicationCard` → `POST /v1/applications/:id/resolve` con `{ action: 'accept' }`. |
| **Arista `MEMBER_OF`** | Sobre `team.member_joined` llega por `network-main` con `GraphPatch` que incluye la arista. `applyPatch()` la inserta. |
| **Status de persona** | El `GraphPatch` del mismo sobre actualiza el nodo de la persona (status → `teamed`). `PersonCard` y `PersonNode` reflejan el cambio. |
| **Status del equipo** | El `GraphPatch` actualiza el nodo del equipo con el nuevo status. `TeamCard` y `TeamNode` lo reflejan. |
| **Sugerencias eliminadas** | **Defensa en dos capas:** (1) Si el backend publica `match.expired` con `removeEdges` al aceptar la solicitud, el grafo elimina las aristas `suggested` de esa persona. (2) Independientemente de si el backend lo hace, el selector `activeSuggestions` filtra las aristas `suggested` cuyo nodo persona ya tiene `status !== 'looking'` — esto garantiza que visualmente desaparecen incluso si el `match.expired` no llega. Ver nota abajo. |
| **Applications auto_rejected** | Sobre `application.resolved` llega por `team-{id}` a los solicitantes afectados. Su UI muestra el rechazo. |
| **Inbox del solicitante** | `InboxItem` generado por `notify` informa al solicitante: "Te uniste a Health AI". |

### Verificación frontend

- [ ] Al aceptar, la arista `MEMBER_OF` aparece en el grafo de todos los clientes sin recargar.
- [ ] El nodo de la persona cambia de status visual (`looking` → `teamed`).
- [ ] El nodo del equipo actualiza su status visual.
- [ ] Las aristas `suggested` de esa persona dejan de mostrarse en el grafo (ya sea por `match.expired` del backend o por filtro defensivo del selector).
- [ ] El solicitante recibe notificación en su inbox.
- [ ] Los demás solicitantes de esa persona ven sus applications como `auto_rejected`.

> ⚠️ **PREGUNTA PENDIENTE PARA EL BACKEND**
>
> Cuando una persona pasa a `teamed` (solicitud aceptada), ¿el backend/MatchMaker publica `match.expired` activamente para todas las sugerencias pendientes de esa persona, o solo expiran por tiempo (`expiresAt`)?
>
> El [invariante 5 del dominio](../docs/02-domain-model.md#invariantes) dice "invalida sus Suggestions vivas", y el [guardarraíl 7 del agente](../docs/06-matchmaker-agent.md) dice "al aceptar una application, se invalidan todas las sugerencias vivas de esa persona". Esto sugiere que SÍ se publican, pero no hay confirmación explícita de que genere sobres `match.expired` hacia Portal (podría solo cambiar el status en la DB sin publicar el removeEdges).
>
> **Decisión defensiva:** el frontend filtra además por `status !== 'looking'` del nodo persona en el selector de sugerencias activas. Si el backend SÍ publica los `match.expired`, el filtro es redundante (correcto igualmente). Si NO los publica, el filtro evita el bug visual.

---

## AC-05 — Límite de equipo

> **Dado** un Team con 4 integrantes  
> **Cuando** el líder intenta aceptar otra Application  
> **Entonces** la operación falla con 409 TEAM_FULL y no se publica nada a Portal.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Mostrar error** | El `POST /v1/applications/:id/resolve` devuelve 409 con `{ error: 'TEAM_FULL' }`. El handler de error muestra un toast: "El equipo ya tiene el máximo de integrantes". |
| **UI preventiva** | Si el equipo tiene `members.length >= maxSize` (derivable del grafo), el botón "Aceptar" se deshabilita visualmente con tooltip explicativo. |
| **No se actualiza el grafo** | Como no se publica nada a Portal, ningún cliente ve cambio alguno. El grafo permanece intacto. |

### Verificación frontend

- [ ] Al intentar aceptar con equipo lleno, se muestra error `TEAM_FULL`.
- [ ] El botón se deshabilita preventivamente si el equipo ya está completo.
- [ ] El grafo no cambia en ningún cliente tras el error.

---

## AC-06 — Reconexión

> **Dado** un cliente que perdió conexión durante 2 minutos  
> **Cuando** reconecta y detecta un hueco de seq  
> **Entonces** solicita GET /v1/graph de nuevo y su grafo queda idéntico al de un cliente que nunca se desconectó.

### Responsabilidad del frontend

| Aspecto | Cómo se implementa |
|---|---|
| **Detección de hueco** | Al recibir un sobre con `seq > lastSeq + 1`, se detecta un hueco. La lógica vive en el handler de mensajes de `network-main`. |
| **Re-fetch del snapshot** | Se llama a `GET /v1/graph` y se reemplaza el store completo con `loadSnapshot()`. |
| **Continuidad** | Tras el snapshot, `lastSeq` se actualiza al `seq` del snapshot. Los sobres posteriores se aplican normalmente. |
| **Indicador visual** | Durante la reconexión: banner "Reconectando...". Durante el re-fetch: "Sincronizando...". Al completar: se oculta. |
| **Acciones REST no se pierden** | Las mutaciones vía REST siguen funcionando durante la desconexión del websocket (son independientes). |

### Verificación frontend

- [ ] Al simular desconexión y reconexión con hueco de `seq`, el frontend pide `GET /v1/graph`.
- [ ] Tras el re-fetch, el grafo es idéntico al de un cliente que nunca se desconectó.
- [ ] El banner de reconexión se muestra y se oculta correctamente.
- [ ] Las acciones REST siguen disponibles durante la desconexión.
- [ ] No se muestran datos duplicados tras la reconexión (el snapshot reemplaza, no acumula).

---

## Resumen de mapeo

| AC | Componentes clave | Verificación principal |
|---|---|---|
| AC-01 | `ProfileForm`, `SkillPicker`, `SkillPreview`, `GraphPanel` | Skills aparecen en grafo tras guardar |
| AC-02 | `EditNeedsForm`, `GraphPanel` (arista suggested), `SuggestionCard`, `FeedLine` | Arista suggested aparece ≤5s punteada y animada |
| AC-03 | `ProfileForm`, `useInbox`, `NotificationBell`, `FeedLine` | Inbox recibe sugerencia + feed público lo muestra |
| AC-04 | `ApplicationCard`, `GraphPanel`, store selectors | Arista MEMBER_OF aparece + estados actualizados en todos los clientes |
| AC-05 | `ApplicationCard`, toast de error | Error 409 mostrado, grafo intacto |
| AC-06 | Handler de `seq`, `loadSnapshot`, banner de reconexión | Grafo idéntico post-reconexión |
