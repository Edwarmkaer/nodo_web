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

## Pendiente

| Tarea | Por qué bloquea |
|---|---|
| Completar el vocabulario a ~70 skills | todo el matching depende de él |
| Ampliar la tabla de alias | sostiene la precisión de la extracción por LLM |
| Calibrar `MATCH_SCORE_THRESHOLD` con datos de semilla | gobierna el volumen de sugerencias del agente |

Ambas son tareas de contenido y ajuste. **No queda diseño pendiente.**
