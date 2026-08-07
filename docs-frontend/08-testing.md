# 08 — Estrategia de pruebas frontend

> Cómo se verifica que el frontend cumple los criterios de aceptación, con énfasis en simular los sobres de Portal para probar AC-02, AC-03, AC-04 y AC-06.

## Principio

El frontend no tiene lógica de dominio: solo aplica parches, muestra datos y envía acciones por REST. Las pruebas verifican que:

1. **GraphPatch se aplica correctamente** (idempotencia, upsert, remove).
2. **La detección de huecos funciona** (reconexión y re-fetch).
3. **Los componentes reflejan el estado del store** (dada una mutación del store, el UI cambia).
4. **Las interacciones REST envían los datos correctos** (formularios → payloads bien formados).

## Niveles

| Nivel | Qué cubre | Herramienta | Velocidad |
|---|---|---|---|
| **Unit (stores)** | `applyPatch`, `loadSnapshot`, selectores, detección de `seq` | Vitest | ms |
| **Unit (componentes)** | Renderizado correcto dado un estado, interacciones | Vitest + Testing Library | ms-decenas ms |
| **Integración** | Flujos completos: arranque → recibir sobres → UI actualizada | Vitest + Testing Library + MSW | cientos de ms |
| **E2E (manual)** | Flujo completo con Portal real | Navegador + backend local | minutos |

No hay E2E automatizado contra Portal real. La razón es la misma que en el backend: Portal es transporte, no fuente de verdad. Lo que importa probar es **cómo reacciona el frontend ante los sobres**, y eso se hace con mocks.

## Herramientas

| Herramienta | Propósito |
|---|---|
| **Vitest** | Test runner (compatible con Vite, rápido) |
| **@testing-library/react** | Renderizar componentes y simular interacción |
| **MSW (Mock Service Worker)** | Interceptar llamadas REST sin mock de fetch |
| **Fake Portal** | Módulo que simula la emisión de sobres de Portal (ver abajo) |

## La costura: Fake Portal

El SDK de Portal (`@portalsdk/react`) se consume a través de hooks. Para testing, se crea un **provider mock** que:

1. No conecta a ningún websocket.
2. Expone un método `emit(channel, envelope)` para simular la llegada de un sobre.
3. Expone un método `setPresence(members)` para simular presence.
4. Provee un `useInbox` fake con un `items` controlable.

```ts
// src/test-utils/fakePortal.ts

type FakePortalContext = {
  emit: (channel: string, envelope: AnyEvent & { seq: number }) => void;
  setPresence: (members: Map<string, PresenceData>) => void;
  addInboxItem: (item: InboxItem) => void;
};

function FakePortalProvider({ children }: { children: React.ReactNode }) {
  // Implementación que expone handlers sin websocket real
  // Los componentes usan los mismos hooks pero reciben datos del fake
}
```

**¿Por qué no mockear el SDK directamente con `vi.mock`?** Porque el SDK expone hooks que dependen de un context interno. Mockear el módulo entero es frágil y rompe con actualizaciones del SDK. Un provider fake es más estable y simula el comportamiento real.

## Pruebas del store — GraphPatch

### Tests de `applyPatch`

```ts
describe('graphStore.applyPatch', () => {
  it('inserta nodos nuevos', () => {
    const store = createGraphStore();
    store.applyPatch({ nodes: [{ id: 'per_1', kind: 'person', label: 'Ana' }] });
    expect(store.nodes.get('per_1')).toMatchObject({ kind: 'person', label: 'Ana' });
  });

  it('upsert: shallow merge — actualiza solo campos presentes sin borrar los existentes', () => {
    const store = createGraphStore();
    store.applyPatch({ nodes: [{ id: 'per_1', kind: 'person', label: 'Ana', status: 'looking' }] });
    // Parche parcial: solo cambia status, no manda label
    store.applyPatch({ nodes: [{ id: 'per_1', kind: 'person', status: 'teamed' }] });
    expect(store.nodes.get('per_1')?.status).toBe('teamed');
    expect(store.nodes.get('per_1')?.label).toBe('Ana'); // no se perdió
  });

  it('upsert con nodo completo: funciona igual que merge (todos los campos se sobrescriben)', () => {
    const store = createGraphStore();
    store.applyPatch({ nodes: [{ id: 'per_1', kind: 'person', label: 'Ana', status: 'looking' }] });
    store.applyPatch({ nodes: [{ id: 'per_1', kind: 'person', label: 'Ana', status: 'teamed' }] });
    expect(store.nodes.get('per_1')?.status).toBe('teamed');
  });

  it('es idempotente: aplicar el mismo parche dos veces produce el mismo resultado', () => {
    const store = createGraphStore();
    const patch = { nodes: [{ id: 'tm_1', kind: 'team', label: 'Health AI' }],
                    edges: [{ id: 'e_1', kind: 'member_of', from: 'per_1', to: 'tm_1' }] };
    store.applyPatch(patch);
    store.applyPatch(patch); // at-least-once delivery
    expect([...store.nodes.values()].filter(n => n.id === 'tm_1')).toHaveLength(1);
    expect([...store.edges.values()].filter(e => e.id === 'e_1')).toHaveLength(1);
  });

  it('removeNodes elimina el nodo y sus aristas asociadas', () => {
    // setup: nodo + aristas
    // patch con removeNodes
    // assert: nodo y aristas eliminadas
  });

  it('removeEdges elimina solo la arista indicada', () => { /* ... */ });
});
```

### Tests de detección de `seq`

```ts
describe('seq detection', () => {
  it('acepta sobre con seq = lastSeq + 1', () => {
    // Debe aplicar el parche normalmente
  });

  it('ignora sobre con seq <= lastSeq (duplicado)', () => {
    // No debe mutar el store
  });

  it('detecta hueco cuando seq > lastSeq + 1 y dispara re-fetch', () => {
    // Debe llamar a GET /v1/graph y reemplazar el store
  });
});
```

## Pruebas por criterio de aceptación

### AC-02 / AC-03 — Sugerencias del MatchMaker

```ts
describe('AC-02: equipo encuentra persona', () => {
  it('al recibir match.suggested, la arista aparece en el grafo como transient', async () => {
    // 1. Render GraphPanel con store inicial (equipo + persona)
    // 2. Emitir sobre match.suggested desde fakePortal
    // 3. Assert: la arista 'suggested' con transient:true existe en el store
    // 4. Assert: graphData pasado a ForceGraph2D contiene el link
  });

  it('la doble publicación (plantilla → rationale real) no duplica la arista', async () => {
    // 1. Emitir match.suggested con rationale "plantilla" (seq N)
    // 2. Emitir match.suggested con mismo id pero rationale real (seq N+1)
    // 3. Assert: solo una arista en el store
    // 4. Assert: el rationale mostrado es el real (segundo)
  });

  it('el feed muestra la actividad del agente', async () => {
    // 1. Emitir match.suggested
    // 2. Assert: FeedStore contiene la línea con "MatchMaker sugirió..."
    // 3. Assert: ActivityFeed renderiza la línea
  });
});
```

### AC-04 — Aceptación en vivo

```ts
describe('AC-04: aceptación de solicitud', () => {
  it('al recibir team.member_joined, la arista MEMBER_OF aparece', async () => {
    // 1. Store con persona looking + equipo recruiting
    // 2. Emitir sobre team.member_joined con GraphPatch que incluye member_of
    // 3. Assert: arista member_of en el store
    // 4. Assert: nodo persona ahora tiene status 'teamed'
  });

  it('al recibir match.expired tras aceptación, las sugerencias desaparecen', async () => {
    // 1. Store con arista suggested
    // 2. Emitir match.expired con removeEdges
    // 3. Assert: arista suggested ya no existe
  });

  it('el selector activeSuggestions excluye sugerencias de una persona que ya no está looking, incluso sin recibir match.expired', () => {
    // 1. Store con arista suggested activa (from: persona con status 'looking')
    // 2. applyPatch cambia el status de esa persona a 'teamed'
    //    (SIN emitir match.expired ni removeEdges)
    // 3. Assert: activeSuggestions ya no incluye esa arista
    //
    // Este test protege AC-04 si el backend no cancela sugerencias
    // activamente al aceptar una solicitud. Es el filtro defensivo
    // documentado en 02-state-model.md y 06-acceptance-criteria-mapping.md.
  });

  it('el líder ve la solicitud como aceptada en el canal del equipo', async () => {
    // 1. Emitir application.resolved en canal team-{id}
    // 2. Assert: ApplicationCard muestra estado "accepted"
  });
});
```

### AC-06 — Reconexión

```ts
describe('AC-06: reconexión con hueco de seq', () => {
  it('al detectar hueco, pide GET /v1/graph y reemplaza el store', async () => {
    // 1. Store con lastSeq = 10
    // 2. Emitir sobre con seq = 15 (hueco: 11, 12, 13, 14 faltan)
    // 3. Assert: se llamó a GET /v1/graph (interceptado con MSW)
    // 4. Assert: store contiene el snapshot completo del mock
    // 5. Assert: lastSeq = seq del snapshot
  });

  it('tras reconexión, el grafo es idéntico al snapshot', async () => {
    // 1. Simular estado con datos "viejos" en el store
    // 2. Triggear reconexión con hueco
    // 3. MSW responde con snapshot "actual"
    // 4. Assert: store === snapshot (no mezcla con datos viejos)
  });

  it('muestra banner de reconexión durante el re-fetch', async () => {
    // 1. Render ConnectionBanner
    // 2. Triggear hueco de seq
    // 3. Assert: banner visible con "Sincronizando..."
    // 4. Resolver el fetch
    // 5. Assert: banner oculto
  });
});
```

## Pruebas de componentes con interacción REST

Se usa MSW para interceptar las llamadas sin mockear `fetch`:

```ts
describe('ApplicationCard — aceptar solicitud', () => {
  it('envía POST /applications/:id/resolve con action accept', async () => {
    const handler = http.post('*/v1/applications/app_1/resolve', () => {
      return HttpResponse.json({}, { status: 200 });
    });
    server.use(handler);

    render(<ApplicationCard application={mockApp} />);
    await userEvent.click(screen.getByRole('button', { name: /aceptar/i }));

    // Assert: el request se envió con { action: 'accept' }
  });

  it('muestra error TEAM_FULL como toast', async () => {
    server.use(
      http.post('*/v1/applications/app_1/resolve', () => {
        return HttpResponse.json({ error: 'TEAM_FULL', message: 'El equipo ya tiene 4 integrantes.' }, { status: 409 });
      })
    );

    render(<ApplicationCard application={mockApp} />);
    await userEvent.click(screen.getByRole('button', { name: /aceptar/i }));

    expect(screen.getByText(/equipo ya tiene/i)).toBeInTheDocument();
  });
});
```

## Pruebas de formularios

```ts
describe('ProfileForm', () => {
  it('envía POST /v1/people con los datos correctos', async () => { /* ... */ });
  it('muestra error HANDLE_TAKEN inline', async () => { /* ... */ });
  it('llama a POST /v1/skills/extract al blur del bio', async () => { /* ... */ });
  it('el SkillPicker solo muestra skills del vocabulario canónico', () => { /* ... */ });
});
```

## Pruebas del flujo del solicitante (ApplyButton + TeamStore)

```ts
describe('ApplyButton — flujo del solicitante', () => {
  it('tras POST /v1/teams/:id/applications exitoso, TeamStore.myApplication se puebla inmediatamente con la respuesta, sin esperar sobre de Portal', async () => {
    // 1. MSW responde 201 con un ApplicationDTO válido
    // 2. Render ApplyButton para un equipo recruiting
    // 3. Click en "Solicitar unirme"
    // 4. Assert: teamStore.myApplication está seteado ANTES de emitir
    //    cualquier sobre desde fakePortal
    // 5. Assert: ApplyButton muestra "Solicitud enviada" (deshabilitado)
    //
    // Este test cubre la ventana de carrera documentada en 05-rest-integration.md:
    // la suscripción a team-{teamId} ocurre después del POST, así que el sobre
    // application.created puede perderse. La respuesta del POST es la fuente
    // de verdad para el estado inmediato del solicitante.
  });

  it('ApplyButton refleja los 3 estados según myApplication', () => {
    // Estado 1: myApplication = null → "Solicitar unirme" (habilitado)
    // Estado 2: myApplication.teamId === este equipo, status 'pending'
    //           → "Solicitud enviada" (deshabilitado)
    // Estado 3: myApplication.status === 'auto_rejected'
    //           → mensaje + botón re-habilitado si equipo sigue recruiting
  });

  it('muestra error DUPLICATE_APPLICATION con la solicitud existente', async () => {
    // MSW responde 409 con { error: 'DUPLICATE_APPLICATION', details: { application: ... } }
    // Assert: ApplyButton usa details.application para poblar myApplication
    //         y muestra "Solicitud enviada"
  });

  it('al recibir application.resolved con status accepted, el solicitante ve el cambio', async () => {
    // 1. teamStore.myApplication = { status: 'pending', teamId: 'tm_1' }
    // 2. Emitir application.resolved con status 'accepted' desde fakePortal (canal team-tm_1)
    // 3. Assert: myApplication.status === 'accepted'
    // 4. Assert: UI refleja "Te uniste al equipo"
  });
});
```

## Datos de prueba

Factories que generan sobres realistas para usar en tests:

```ts
// src/test-utils/factories.ts
export function makePersonNode(overrides?: Partial<GraphNode>): GraphNode { /* ... */ }
export function makeTeamNode(overrides?: Partial<GraphNode>): GraphNode { /* ... */ }
export function makeSuggestedEdge(from: string, to: string): GraphEdge { /* ... */ }
export function makeMatchSuggestedEnvelope(personId: string, teamId: string): MainEvent { /* ... */ }
export function makeTeamMemberJoinedEnvelope(teamId: string, personId: string): MainEvent { /* ... */ }
```

## Cobertura

| Área | Objetivo mínimo |
|---|---|
| Stores (applyPatch, loadSnapshot, selectores) | 100% de las funciones |
| Detección de seq | 100% de los branches |
| Componentes críticos (GraphPanel, ApplicationCard, ProfileForm) | Render + happy path + error path |
| Flujos de integración (arranque, reconexión) | Happy path |

## Fuera de alcance

- **E2E automatizado contra Portal real.** Se verifica manualmente con backend local.
- **Performance testing del grafo.** react-force-graph se confía hasta ~2000 nodos en Canvas (suficiente para un hackathon).
- **Visual regression testing.** No para un MVP.
- **Accessibility testing automatizado.** Se siguen prácticas básicas (aria-labels, roles) pero no hay suite de a11y automatizada.

## Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```
