# Nodo — Documentación de backend

**Nodo: The Realtime Talent Network.** Mercado de talento en tiempo real donde personas, ideas, equipos y un agente de IA conviven en un grafo vivo: las personas publican lo que saben hacer, los equipos publican lo que les falta, y un agente conecta ambos lados de forma continua y explicada.

## Alcance

Estos documentos especifican **el backend**: un API REST sobre Node, con PostgreSQL como fuente de verdad y Portal como capa de tiempo real. No cubren la interfaz de usuario.

[03 — Contrato Portal](03-portal-contract.md) es la excepción aparente: define canales y sobres de mensaje. Es un entregable del backend porque el backend configura `portal.config.ts`, publica los sobres y define las capacidades de `authz`. El frontend lo consume; no lo define.

## Documentos

Cada uno asume cerrados los anteriores.

| # | Documento | Qué fija |
|---|---|---|
| 01 | [Decisiones](01-decisions.md) | Stack, credenciales y los ADR que los justifican. |
| 02 | [Modelo de dominio](02-domain-model.md) | Nodos, aristas, estados, invariantes y criterios de aceptación. |
| 03 | [Contrato Portal](03-portal-contract.md) | Canales, sobres, `authz` y `notify`. Es lo que consume el frontend. |
| 04 | [Modelo de datos](04-data-model.md) | Esquema SQL, índices e invariantes en base de datos. |
| 05 | [API REST](05-rest-api.md) | Rutas, payloads y errores. |
| 06 | [Agente MatchMaker](06-matchmaker-agent.md) | Disparadores, scoring, prompts y guardarraíles. |
| 07 | [Arquitectura](07-architecture.md) | Flujos, secuencias, consistencia y riesgos. |
| 08 | [Configuración y despliegue](08-operations.md) | Provisión de Portal, variables de entorno, despliegue y diagnóstico. |
| 09 | [Contratos compartidos](09-contracts.md) | Los tipos de `@nodo/contracts`. Referencia ejecutable de 03 y 05. |
| 10 | [Estrategia de pruebas](10-testing.md) | Niveles, dobles de Portal y del LLM, y el mapa de los criterios de aceptación. |

Si una decisión posterior contradice un ADR, se escribe un ADR nuevo que lo supersede; el anterior no se edita. Así el acuerdo vigente es siempre verificable.

## Registro de correcciones

Revisión previa a la implementación de `@nodo/contracts`. Ningún ADR quedó superseded: las siete resoluciones cierran huecos o corrigen documentos que se habían desviado de un ADR vigente. Las dos decisiones que ninguna anterior cubría se registraron como ADR nuevos.

| Qué se resolvió | Dónde |
|---|---|
| La identidad se acuña en `POST /v1/people`, no en un `POST /v1/session` previo; la recuperación pasa a `POST /v1/session/recover` | 03, 05, 09 — restablece lo que ya decía ADR-006 |
| `Team.status` se deriva por cascada con precedencia explícita; `recruiting` es el caso por defecto | 02 |
| `HAS_SKILL` pierde `level`: ninguna ruta lo producía ni ningún cálculo lo consumía | 02, 09 |
| `matchedSkills` viaja con `label` y `category`; la consulta une `skills` | 03, 04, 06 |
| El score completo y el umbral se calculan en SQL, antes del recorte | 04, 06 |
| `bio` es público; se retira la condición que ninguna columna sostenía | 09 |
| Los ids de arista son deterministas | 04 |
| Semántica de la marca de agua `seq` | **ADR-009** |
| Partición del sobre en `MainEnvelope` / `TeamEnvelope` | **ADR-010** |

El ejemplo de `notify` en ADR-008 lee `content.leadId` donde el payload es `{ application }`. No se edita, por la regla de arriba: la versión vigente y correcta es la de [03](03-portal-contract.md).

## Principio rector

> **El backend nunca sostiene una conexión de tiempo real.**

Portal mantiene los websockets (`wss://realtime.useportal.co`). El backend solo emite JWTs, publica por HTTP cuando cambia el estado, y ejecuta el agente MatchMaker. Cualquier diseño que requiera que el backend mantenga clientes conectados contradice este principio y debe revisarse.

## Arranque

```bash
pnpm install
cp .env.example .env      # ver 08-operations.md
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Runtime Node 22 + pnpm, idéntico en local y en producción.

## Estado de la implementación

El backend está escrito: `@nodo/contracts`, esquema y migraciones, dominio, agente MatchMaker, publicación a Portal, rutas HTTP y `portal.config.ts`, con 74 pruebas en verde (`pnpm test`). No se ha ejecutado contra una Postgres real en este entorno — ver [10](10-testing.md) para qué nivel de prueba requiere cuál dependencia.

## Pendiente

| Tarea | Por qué bloquea |
|---|---|
| Calibrar `MATCH_SCORE_THRESHOLD` con tráfico real | gobierna el volumen de sugerencias del agente; no se puede fijar de forma teórica |
| Verificar `authz`/`notify` de `portal.config.ts` contra un cliente real | docs/10: es la única verificación que queda manual, deliberadamente |
| Provisionar Portal y ejecutar `portal deploy` | [08](08-operations.md): prerrequisito de despliegue, no de código |

El vocabulario (75 skills, 141 alias) y las migraciones ya están escritos y sembrados por `pnpm db:seed`. **No queda diseño ni código pendiente** — lo que resta es operar el sistema contra servicios reales.
