# 06 — Agente MatchMaker

El agente hace **una sola cosa extremadamente bien**: detectar compatibilidad entre lo que un equipo necesita y lo que una persona sabe, y explicarla en lenguaje natural.

## Principio de diseño

> **El LLM no decide a quién sugerir. El LLM redacta por qué.**

El candidato y el score salen de SQL determinista. El LLM recibe un match ya elegido y escribe el rationale.

Esto se decidió así por tres razones, en orden de importancia:

1. **Explicabilidad.** La respuesta a "por qué se emitió esta sugerencia" es una fórmula reproducible, no una inferencia opaca. El usuario recibe la razón real, no una racionalización.
2. **Latencia.** El candidato aparece en el grafo en ~50 ms; el texto llega después. Ver "publicación en dos fases".
3. **Tolerancia a fallos.** Ante una caída del proveedor, el matchmaker sigue operando con rationale de plantilla. El producto degrada su calidad de texto, no su funcionalidad.

## Disparadores

En proceso, tras el commit ([ADR-004](01-decisions.md)):

| Evento | Dirección que se evalúa |
|---|---|
| `person.upserted` (skills cambiaron) | `person_seeks_team` |
| `person.status_changed → looking` | `person_seeks_team` |
| `team.created` | `team_needs_person` |
| `team.updated` (needs cambiaron) | `team_needs_person` |
| `team.member_joined` | `team_needs_person` (needs restantes) |

**Debounce de 800 ms por entidad.** Alguien editando su perfil dispara cinco `PATCH` seguidos; sin debounce son cinco tandas de sugerencias y un feed inservible.

La cola es en memoria (`p-queue`, concurrencia 2). No hace falta Redis: si el proceso se reinicia se pierde una tanda de sugerencias, y la siguiente escritura la regenera. Aceptado explícitamente.

## Scoring

Determinista, sin LLM.

```
score = 2 · |skills ∩ needs_required|
      + 1 · |skills ∩ needs_nice|
      + 1  si availability = 'full'
      + 1  si coincide el idioma
```

**Umbral: `score ≥ 3`.** Por debajo no se publica nada. **La fórmula entera y el umbral viven en SQL**, en la misma consulta que elige a los candidatos: si el recorte a los primeros N ocurriera antes de sumar los bonus, el resultado dejaría de ser el mejor conjunto ([04](04-data-model.md)).

El umbral gobierna el volumen de sugerencias: un valor bajo satura el feed y el grafo, uno alto reduce la actividad visible del agente. `3` equivale a *al menos un skill `required`, o dos `nice`*. Se calibra contra los datos de semilla antes de exponer el sistema a usuarios reales.

### Consulta — dirección principal (`team_needs_person`)

La de [04](04-data-model.md), `limit 5`.

### Consulta — dirección inversa (`person_seeks_team`)

```sql
-- $1 = person_id · $2 = MATCH_SCORE_THRESHOLD
select *
from (
  select
    t.id,
    t.label,
      sum(case when e_need.meta->>'priority' = 'required' then 2 else 1 end)
    + (case when me.availability = 'full'          then 1 else 0 end)
    + (case when me.language     = lead.language   then 1 else 0 end)   as score,
    jsonb_agg(jsonb_build_object(
      'slug',     s.slug,
      'label',    s.label,
      'category', s.category,
      'priority', e_need.meta->>'priority'
    )) as matched_skills
  from edges  e_skill
  join edges  e_need on e_need.kind  = 'needs'
                    and e_need.to_id = e_skill.to_id
  join nodes  t      on t.id   = e_need.from_id
  join teams  te     on te.id  = t.id
  join people lead   on lead.id = te.lead_id
  join people me     on me.id  = $1
  join skills s      on s.slug = e_need.to_id
  where e_skill.kind    = 'has_skill'
    and e_skill.from_id = $1
    and t.kind          = 'team'
    and t.status in ('recruiting','almost_full')
  group by t.id, t.label, me.availability, me.language, lead.language
) c
where c.score >= $2
order by c.score desc
limit 3;
```

El idioma del equipo es el de su líder, de ahí el `join` a `people` por `teams.lead_id`. En esta dirección varía por candidato —cada equipo tiene su líder—, mientras que en la dirección principal es constante y entra como parámetro.

## Guardarraíles

Sin estos, el agente se vuelve spam a las dos horas de evento.

1. **No repetir.** `unique (person_id, team_id)` en `suggestions`. Una sola sugerencia por par, de forma permanente. El `insert` va con `on conflict do nothing`: que un par ya esté quemado es el caso normal, no un error que deba abortar la tanda. Las dos direcciones producen el mismo par, así que la primera que llegue lo reclama.
2. **Caducidad 2 h.** Un job cada 5 min pasa las vencidas a `status = 'expired'` y publica `match.expired`, de modo que el grafo no acumula sugerencias muertas.

   > **Las filas caducadas no se eliminan.** Si se eliminaran, el índice único del guardarraíl 1 dejaría de aplicar y el mismo par volvería a sugerirse cada dos horas. Solo cambia el `status`.
3. **Tope por persona:** máximo 3 sugerencias vivas. La nueva desplaza a la de menor score.
4. **Tope por equipo:** máximo 5 sugerencias vivas.

   > **Desplazar es caducar.** La sugerencia desplazada pasa a `status = 'expired'` y publica `match.expired`, igual que si hubiera vencido por tiempo: la arista tiene que desaparecer del grafo de todos los clientes, y `match.expired` es el único sobre que lo hace. Su fila permanece, así que el par sigue bloqueado por el guardarraíl 1.
5. **Nunca a personas `teamed` o `idle`.** Filtrado en SQL, no en código.
6. **Nunca a equipos `complete` o `building`.** En `person_seeks_team` lo filtra el `where` de la consulta. En `team_needs_person` el equipo es el parámetro, así que lo comprueba el disparador antes de consultar: un equipo que acaba de completarse no llega a evaluarse.
7. **Al aceptar una application**, se invalidan todas las sugerencias vivas de esa persona.
8. **Anti-bucle:** el receptor de webhook descarta `senderId === 'agent:matchmaker'` antes de cualquier otra cosa.

## Los dos usos del LLM

Ambos usos pasan por la interfaz de [ADR-007](01-decisions.md#adr-007--capa-de-llm-intercambiable). Proveedor: **Groq**; modelo en `LLM_MODEL`, nunca en código.

Salida estructurada con `response_format: { type: 'json_object' }` + **validación Zod obligatoria**. No se usa *tool use*: JSON mode es lo que se comporta igual en todos los proveedores compatibles con OpenAI, y el objetivo es poder cambiar de proveedor sin tocar el agente.

| Uso | Modelo sugerido | Por qué |
|---|---|---|
| Extracción de skills | `llama-3.3-70b-versatile` | necesita seguir un vocabulario cerrado con fidelidad |
| Redacción del rationale | `llama-3.3-70b-versatile` | 2 frases; cualquier modelo capaz sirve |

> Groq rota y deprecia modelos con frecuencia. **Verifica los IDs vigentes** en la consola de Groq el jueves y ajusta `LLM_MODEL`. Es una env var justamente para esto.

### 1. Extracción de skills

Convierte texto libre en tags canónicos. Síncrono, en el guardado del perfil.

```
System:
Extraes habilidades técnicas de la descripción libre de un participante.

Reglas estrictas:
- Devuelve ÚNICAMENTE slugs del vocabulario proporcionado. Nunca inventes uno.
- Si el texto menciona una tecnología que no está en el vocabulario, mapéala a
  la categoría más cercana que sí esté (ej. "Svelte" → "frontend").
- Infiere las categorías amplias además de las tecnologías concretas:
  quien menciona Angular sabe "frontend"; quien menciona Go y PostgreSQL sabe "backend".
- Máximo 8 slugs. Prioriza los explícitos sobre los inferidos.
- confidence: 1.0 explícito en el texto, 0.6 inferido.

Vocabulario: {lista de slugs con label y categoría}

User:
{bio_raw}
```

Salida JSON, validada con Zod contra el vocabulario:
```jsonc
{ "skills": [
  { "slug": "angular", "confidence": 1.0 },
  { "slug": "go", "confidence": 1.0 },
  { "slug": "postgresql", "confidence": 1.0 },
  { "slug": "frontend", "confidence": 0.6 },
  { "slug": "backend", "confidence": 0.6 }
]}
```

**Validación post-LLM obligatoria:** cualquier slug fuera de `skills` ∪ `skill_aliases` se descarta en silencio. El invariante 6 se cumple en código, no confiando en el prompt. Este es exactamente el caso AC-01.

### 2. Redacción del rationale

Recibe un match ya decidido.

```
System:
Escribes la explicación de por qué una persona encaja en un equipo de proyecto.

- 1 o 2 frases. Máximo 220 caracteres.
- NOMBRA los skills coincidentes de forma explícita. Sin ellos la explicación no sirve.
- Tono directo y cálido. Sin superlativos ni marketing.
- Escribe en {language}.
- No inventes datos que no estén en la entrada.
- No prometas resultados ("van a ganar", "es el match perfecto").

User:
Persona: {displayName} — {headline}
Skills: {skills}
Equipo: {teamName} — {pitch}
Necesita: {needs con prioridad}
Coincidencias: {matchedSkills}
Idioma común: {sí|no}
```

**Validación post-LLM:** si el texto no contiene al menos un `label` de `matchedSkills`, se descarta y se usa la plantilla. Un rationale genérico es un bug (ver [03](03-portal-contract.md)).

### Fallback de plantilla

Se usa si el LLM falla, tarda más de 4 s, o no pasa la validación:

```
{displayName} sabe {skill1} y {skill2}, justo lo que {teamName} está buscando.
```

Nunca deja al usuario sin explicación.

## Publicación en dos fases

Detalle que separa una demo fluida de una que se siente lenta:

```
1. score y candidatos            (~20 ms)
2. persistir suggestions          (~10 ms)
3. publicar match.suggested con rationale de plantilla   ← el grafo se mueve YA
4. llamar al LLM                 (~300 ms con Groq)
5. publicar match.suggested de nuevo, mismo id, rationale real
```

El paso 5 es un **upsert** por `id` de arista, así que el cliente solo ve cómo el texto se enriquece. La arista aparece al instante.

Con Groq el texto llega lo bastante rápido como para que las dos fases casi se fundan. El mecanismo se mantiene porque desacopla la latencia percibida del proveedor: si se conmuta a uno más lento ([ADR-007](01-decisions.md#adr-007--capa-de-llm-intercambiable)), la arista sigue apareciendo de inmediato.

## El agente como participante

Requisito de la visión: la IA no está escondida.

- `matchmaker` es un nodo `agent` en el grafo, presente desde el seed.
- Publica con `actor.kind = 'agent'`, así el feed lo muestra con su propia identidad.
- Sus aristas son `transient: true` → el frontend las dibuja punteadas y animadas.
- Se le publica **actividad** en el canal cuando está evaluando, para que el feed muestre "MatchMaker está analizando…". Es un mensaje **efímero**: no se persiste, no dispara webhook, no ensucia el historial.

## Observabilidad

Cada tanda registra en consola estructurada: `trigger`, `direction`, `entityId`, candidatos evaluados, cuántos superaron el umbral, latencia de SQL, latencia del LLM, si hubo fallback.

`GET /v1/_debug/matchmaker` devuelve las últimas 50 tandas. Es la vía para determinar por qué una sugerencia se emitió o no, sin inferirlo de los logs.
