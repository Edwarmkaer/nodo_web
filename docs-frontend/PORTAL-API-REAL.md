# Portal SDK — API real confirmada desde docs oficiales

> Este documento consolida lo que se verificó directamente de https://docs.useportal.co y corrige los supuestos incorrectos en docs-frontend/.

## Fuentes verificadas

- https://docs.useportal.co (Quickstart)
- https://docs.useportal.co/core/client-setup
- https://docs.useportal.co/core/channels
- https://docs.useportal.co/core/tokens-and-auth
- https://docs.useportal.co/react/provider
- https://docs.useportal.co/react/use-channel
- https://docs.useportal.co/react/use-inbox
- https://docs.useportal.co/react/patterns
- https://docs.useportal.co/config-cli/portal-config
- https://docs.useportal.co/config-cli/deploy-and-secrets
- https://docs.useportal.co/wire-protocol

---

## 1. PortalProvider — props reales

**INCORRECTO en 01-decisions / 03-portal-integration:**
```tsx
<PortalProvider publicKey={...} authToken={async () => {...}}>
```

**CORRECTO:**
```tsx
import { Portal } from "@portalsdk/core";
import { PortalProvider } from "@portalsdk/react";

// Construir UNA VEZ, a nivel de módulo (fuera del árbol de componentes)
const portal = new Portal({ apiKey: "pk_your_publishable_key" });

async function fetchPortalToken(): Promise<string> {
  const res = await fetch(`${API_URL}/v1/portal/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getSessionToken()}` },
  });
  const { token } = await res.json();
  return token;
}

export function App() {
  return (
    <PortalProvider client={portal} token={fetchPortalToken}>
      <RouterAndApp />
    </PortalProvider>
  );
}
```

**Detalles clave:**
- `PortalProvider` recibe `client` (instancia de `Portal`) y `token` (string | callback | undefined).
- El constructor `new Portal({ apiKey })` es síncrono y pasivo — no hace nada en red hasta que un hook se monta.
- El callback `token` se re-invoca en connect, reconnect y expiry (comportamiento correcto, solo estaba mal el nombre de la prop).
- `portal.setToken(undefined)` vuelve a modo anónimo sin remount.
- No hay `publicKey` ni `authToken` como props.

---

## 2. No hay `subscribe()` explícito — `useChannel` abre la conexión al montar

**INCORRECTO en 03-portal-integration:**
```
4. subscribe('network-main')
```

**CORRECTO:**
```tsx
function NetworkListener() {
  const { messages, status, presence } = useChannel<MainEvent>({
    channelId: 'network-main',
    history: 50,
    metadata: { /* presence metadata */ },
    onMessage: (msg) => { /* verificar seq, aplicar patch */ },
  });
  // ...
}
```

**Detalles clave:**
- Montar un componente con `useChannel({ channelId: 'network-main' })` abre la conexión.
- Desmontar la cierra (refcounted — si múltiples componentes usan el mismo channelId, comparten un socket).
- `channelId: undefined` renderiza inerte (patrón "nothing selected").
- No hay método `.subscribe()` o `.acquire()` para llamar manualmente desde React.

---

## 3. `seq` SÍ está expuesto en Message

**Confirmado en wire-protocol:**
> "Every message on the wire — persistent or ephemeral — shares one envelope shape: `id`, `seq` (`null` for ephemeral messages), `type`, `kind`, opaque `content`, `sender`, `timestamp`, optional `to`/`mentions`, and `retracted`/`ephemeral` flags."

- Mensajes persistentes tienen `seq: number`.
- Mensajes efímeros tienen `seq: null`.
- El gap detection funciona: "A gap is detected whenever a delivered `seq` is greater than `(held seq) + 1`."

**Cómo acceder desde React:**
- `useChannel().messages` es el array de `Message<M>[]` que incluye `msg.id`, `msg.seq`, `msg.content`, etc.
- `onMessage` callback recibe cada mensaje individual con su `seq`.

---

## 4. Presence — DetailedPresence vs AggregatePresence

**Confirmado en core/channels:**
> "Small/standard channels get `DetailedPresence` (`{ kind: "detailed", participants, count }`); larger ones get `AggregatePresence` (`{ kind: "aggregate", count, recent }`) with only join/leave deltas, not a full roster."

**Implicación para Nodo:**
- Si `network-main` tiene decenas de participantes → probablemente `DetailedPresence` (roster completo, `OnlineIndicator` viable).
- Si tiene cientos → podría caer en `AggregatePresence` (solo `count` + `recent` joins/leaves, no roster completo).
- **El umbral no está documentado.**

**Decisión defensiva:** verificar `presence.kind` antes de usar:
```ts
const { presence } = useChannel({ channelId: 'network-main' });
if (presence?.kind === 'detailed') {
  // roster completo: puedo marcar cada persona como online/offline
  const onlineIds = new Set(presence.participants.map(p => p.id));
} else if (presence?.kind === 'aggregate') {
  // solo counter: mostrar "X personas en línea" sin badges individuales
  const count = presence.count;
}
```

> ⚠️ **PREGUNTA SIN RESOLVER:** ¿Cuál es el umbral de participantes para que un canal pase de Detailed a Aggregate? Para un hackathon típico (50-200 personas), ¿`network-main` caería en modo agregado? Si sí, `OnlineIndicator` por persona no es viable — se muestra solo un contador global.

---

## 5. Estados de conexión del canal — 7 estados reales

**INCORRECTO en 02-state-model:**
```ts
connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
```

**CORRECTO (de core/channels):**
```ts
status: "idle" | "connecting" | "ready" | "reconnecting" | "degraded" | "degraded-http" | "blocked";
```

**Significado:**
| Estado | Qué pasa | UI sugerida |
|---|---|---|
| `idle` | Handle creado pero no adquirido | — (no debería verse en producción) |
| `connecting` | Primer intento de conexión | Spinner / "Conectando..." |
| `ready` | Conectado y operativo | Ocultar banner |
| `reconnecting` | Socket caído, reintentando | Banner "Reconectando..." |
| `degraded` | Conexión parcialmente funcional | Banner leve de advertencia |
| `degraded-http` | Socket caído, pero HTTP publish sigue funcionando | Banner "Conexión inestable" (REST sigue operativo) |
| `blocked` | Terminal: key inválida, baneado, no es miembro, canal lleno | Error terminal "No se pudo conectar" + acción (NO spinner infinito) |

**`blocked` es terminal** — no hay reintento automático. El UI debe distinguirlo de `reconnecting`.

**Caso especial: `TokenExpiredError` → `blocked`.** Si el callback `token` sigue fallando tras expiración del JWT, Portal lanza `TokenExpiredError` y el canal pasa a `"blocked"`. Esto ocurre cuando el `sessionToken` en localStorage ya no es válido (expirado o revocado). En este caso, el banner no debe mostrar un error genérico ni un spinner — debe ofrecer ir a `RecoveryModal` o recrear sesión (flujo de onboarding), porque el problema es de identidad, no de red.

---

## 6. Gap-fill automático de Portal

**Confirmado en wire-protocol:**
> "A gap is detected whenever a delivered `seq` is greater than `(held seq) + 1`. Filling one is layered: first, a `last={seq}` reconnect replay; failing that, a direct HTTP range fetch (with a small 0–2s client-side jitter)."

**Implicación:** Portal ya hace gap-fill automático en reconexión corta. El mecanismo manual del frontend (comparar seq → pedir GET /v1/graph) solo necesita activarse cuando:
1. El gap-fill automático de Portal no alcanza (desconexiones largas > backfill de 50 mensajes).
2. Se detecta un `seq` que excede el automático.

**En la práctica para Nodo:** dado que el backend define `history: 50` y nuestro propio contrato dice que el backfill de 50 es insuficiente para desconexiones largas, el mecanismo de re-fetch de snapshot sigue siendo necesario — pero no necesita correr en CADA mensaje. Solo cuando el channel status pasa a `ready` después de un `reconnecting` y el `seq` del primer mensaje post-reconexión indica un gap que el replay no cubrió.

---

## 7. CLI de Portal — NO existe `portal origins add`

**INCORRECTO en T-053 y 08-operations del backend:**
```bash
portal origins add https://nodo.app
```

**CORRECTO — el CLI solo tiene dos comandos:**
```bash
portal deploy          # despliega portal.config.ts
portal secrets set NAME  # configura un secreto
```

**No existe `portal origins add`.** El manejo de orígenes permitidos (CORS) no está documentado en la CLI. Posibilidades:
1. Se configura desde un dashboard web de Portal (no documentado en los docs públicos).
2. Se maneja automáticamente por Portal basándose en el API key.
3. Es un parámetro en alguna configuración que no está en los docs que revisé.

> ⚠️ **VERIFICAR:** ¿Cómo se configuran los orígenes permitidos en Portal? El backend asumió `portal origins add` pero no existe en la CLI documentada. Esto afecta T-053 (deploy) y es necesario resolver antes de desplegar.

---

## 8. useInbox — API real

**Confirmado:**
```ts
const { channels, items, counter, unseen, markAllRead, status } = useInbox();
```

- `counter`: global (todas las notificaciones no leídas).
- `unseen`: scoped al filtro de este hook (si se usa `where`).
- `onItem`: fires una vez por item nuevo (post-mount, nunca para backlog inicial, nunca duplicado).
- `markAllRead()`: global, zero-argument.
- **NO existe `item.markAsRead()`** individual tal como lo documentamos. Lo que existe es `channels.get(channelId)?.markAsRead()` a nivel de canal.

---

## 9. `onMessage` callback en useChannel

**Confirmado:**
```ts
useChannel<M>({
  channelId: 'network-main',
  onMessage: (msg: Message<M>) => {
    // msg.id, msg.seq, msg.content, msg.sender, msg.timestamp, msg.ephemeral
    // Se dispara para CADA mensaje (persistente o efímero)
  },
});
```

Este es el hook para nuestra lógica de verificación de seq y aplicación de patches.

---

## Resumen de correcciones necesarias en docs-frontend/

| Doc | Qué corregir |
|---|---|
| 01-decisions (ADR-F-003) | Props de PortalProvider: `client` + `token`, no `publicKey` + `authToken` |
| 02-state-model | `connectionStatus` → 7 estados reales de Portal |
| 03-portal-integration | Secuencia de arranque (no hay `subscribe()`), PortalProvider code snippet, states de conexión, gap-fill simplificado |
| 03-portal-integration | Presence: verificar `presence.kind` antes de asumir roster completo |
| 04-screens-and-components | ConnectionBanner: mapear 7 estados, `blocked` es terminal |
| tasks.md (T-013) | Corregir patrón de inicialización |
| tasks.md (T-044) | ConnectionBanner con 7 estados |
| tasks.md (T-053) | Eliminar `portal origins add` — verificar cómo se configuran orígenes |
