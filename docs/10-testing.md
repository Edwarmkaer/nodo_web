# 10 — Estrategia de pruebas

Los seis criterios de aceptación de [02](02-domain-model.md) son la especificación. Este documento define **a qué nivel se verifica cada uno** y cómo se sustituyen las dos dependencias externas que no pueden invocarse en una prueba: Portal y el LLM.

## Niveles

| Nivel | Qué cubre | Dependencias | Velocidad |
|---|---|---|---|
| **Dominio** | invariantes y máquinas de estado | ninguna | ms |
| **Datos** | esquema, índices, transacciones | Postgres | decenas de ms |
| **Contrato** | esquemas Zod de [09](09-contracts.md) | ninguna | ms |
| **Servicio** | handlers completos de extremo a extremo | Postgres + dobles | cientos de ms |

No hay nivel de extremo a extremo contra Portal real. La razón está en [ADR-005](01-decisions.md#adr-005--postgres-es-la-fuente-de-verdad-portal-es-transporte): Portal es transporte, no fuente de verdad. Lo que debe verificarse es **qué sobre se emite**, y eso se observa en el doble.

## Las dos costuras

Ambas dependencias externas se consumen a través de una interfaz, nunca directamente. Es un requisito de diseño, no solo de pruebas: el módulo `portal/` y el módulo `agent/` de [07](07-architecture.md) exponen estas dos.

### Publicador de Portal

```ts
export interface PortalPublisher {
  publish(channel: string, envelope: AnyEvent): Promise<{ id: string; seq: number }>;
}
```

El doble acumula lo publicado y permite aserciones sobre canal, `type` y `graph`:

```ts
const portal = new FakePortalPublisher();
// …ejecutar el handler…
expect(portal.published).toMatchObject([
  { channel: 'network-main', envelope: { type: 'team.updated' } },
]);
```

Verificar el `GraphPatch` emitido es lo que impide que el grafo del cliente se desincronice: un handler que escribe en Postgres pero olvida el parche pasa cualquier prueba de base de datos y rompe la interfaz.

### Proveedor de LLM

La interfaz ya existe por [ADR-007](01-decisions.md#adr-007--capa-de-llm-intercambiable):

```ts
export interface LlmProvider {
  extractSkills(text: string): Promise<Array<{ slug: string; confidence: number }>>;
  writeRationale(input: RationaleInput): Promise<string>;
}
```

Tres dobles, uno por escenario:

| Doble | Devuelve | Verifica |
|---|---|---|
| `FakeLlm` | respuesta fija válida | camino feliz |
| `HallucinatingLlm` | slugs fuera del vocabulario | que la validación posterior los descarta ([invariante 6](02-domain-model.md#invariantes)) |
| `FailingLlm` | lanza excepción o excede el timeout | que entra el fallback de plantilla |

Los dos últimos importan más que el primero: cubren las rutas que en producción aparecen bajo fallo y que nunca se ejercitan a mano.

### La cola del agente

Hay una tercera costura, más pequeña, que existe solo por las pruebas de AC-02 y AC-03: el planificador de la cola. El agente no llama a `p-queue` directamente sino a una interfaz de un método, y el doble de pruebas ejecuta la tarea en el acto.

```ts
export interface Scheduler {
  schedule(key: string, task: () => Promise<void>): void;
}
```

Sin ella, «ejecutar el matchmaker de forma síncrona» obligaría a esperar los 800 ms de debounce en cada prueba, o a exponer internos de la cola para vaciarla a mano.

## Mapa de criterios de aceptación

| AC | Nivel | Cómo se verifica |
|---|---|---|
| **AC-01** extracción de skills | servicio | `FakeLlm` devuelve los cinco slugs esperados; `HallucinatingLlm` confirma que un slug inventado no se persiste |
| **AC-02** el equipo encuentra a la persona | servicio | sembrar equipo y persona, ejecutar el matchmaker de forma síncrona, afirmar sobre el `match.suggested` capturado y que el rationale contiene `go` |
| **AC-03** la persona encuentra al equipo | servicio | igual que AC-02 en la dirección inversa |
| **AC-04** aceptación de solicitud | datos + servicio | tras `resolve`, comprobar `MEMBER_OF`, `status`, las `auto_rejected` y los tres sobres publicados |
| **AC-05** límite de equipo | dominio + datos | aceptar sobre un equipo lleno lanza `TEAM_FULL`, la transacción revierte y **el doble de Portal queda vacío** |
| **AC-06** reconexión | fuera del backend | el backend solo garantiza que `GET /v1/graph` devuelve estado completo y `seq` coherente; la detección de huecos vive en el cliente |

La aserción de AC-05 sobre el doble vacío es la que protege la regla `commit → publish` de [05](05-rest-api.md): si un handler publica antes de la transacción, esa prueba falla y ninguna otra lo haría.

## Pruebas de invariantes

Los nueve invariantes de [02](02-domain-model.md) se verifican **dos veces**, a propósito:

- en el nivel de dominio, que la lógica los respeta;
- en el nivel de datos, que la restricción existe en Postgres.

Una prueba de datos que inserta directamente rompiendo el invariante y espera un error de restricción es la que detecta si alguien elimina un índice único. La prueba de dominio no lo detectaría.

Caso concreto: insertar dos `member_of` para la misma persona debe fallar por `one_team_per_person`, no por lógica de servicio.

## Datos de prueba

El nivel de datos y el de servicio corren contra una base efímera con las migraciones aplicadas y **solo el vocabulario** cargado ([08](08-operations.md)). El conjunto representativo no se usa en pruebas: los datos deben construirse en cada caso para que la aserción sea legible sin conocer la semilla.

Cada prueba envuelve su ejecución en una transacción que revierte al final. Sin eso, el índice único `one_suggestion_per_pair` hace que la segunda prueba del matchmaker falle por contaminación de la primera.

## Fuera de alcance

Declarado, no accidental:

- **Portal real.** No hay prueba automatizada contra el servicio. La verificación de que `authz` y `notify` funcionan es manual, con un cliente conectado, y figura en el diagnóstico de [08](08-operations.md).
- **Calidad del texto del LLM.** Se verifica que el rationale contiene los skills coincidentes; no que esté bien redactado.
- **Rendimiento.** No hay pruebas de carga.
