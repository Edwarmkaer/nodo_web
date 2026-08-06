# Nodo

**The Realtime Talent Network.** Mercado de talento en tiempo real donde personas, ideas, equipos y un agente de IA conviven en un grafo vivo: las personas publican lo que saben hacer, los equipos publican lo que les falta, y un agente conecta ambos lados de forma continua y explicada.

## Estado

Especificación de backend completa. Sin implementación todavía.

## Documentación

La especificación vive en [`docs/`](docs/README.md).

| # | Documento |
|---|---|
| 01 | [Decisiones de arquitectura](docs/01-decisions.md) |
| 02 | [Modelo de dominio](docs/02-domain-model.md) |
| 03 | [Contrato Portal](docs/03-portal-contract.md) |
| 04 | [Modelo de datos](docs/04-data-model.md) |
| 05 | [API REST](docs/05-rest-api.md) |
| 06 | [Agente MatchMaker](docs/06-matchmaker-agent.md) |
| 07 | [Arquitectura](docs/07-architecture.md) |
| 08 | [Configuración y despliegue](docs/08-operations.md) |
| 09 | [Contratos compartidos](docs/09-contracts.md) |
| 10 | [Estrategia de pruebas](docs/10-testing.md) |

## Stack

```
TypeScript 5 · Node 22 · Hono          API REST
PostgreSQL (Supabase)                  grafo en nodes / edges
Portal                                 tiempo real: canales, presence, inbox
Groq (API compatible con OpenAI)       extracción de skills y explicaciones
```

El detalle y las razones están en [01](docs/01-decisions.md).
