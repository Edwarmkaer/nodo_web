import OpenAI from 'openai';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { people, suggestions, teams } from '../db/schema.js';
import type { Env } from '../config.js';

/**
 * Chat de demostración sobre una sugerencia ya emitida. **Fuera del contrato
 * de ADR-007 a propósito**: esa decisión fija la interfaz del LLM en
 * exactamente dos métodos (`extractSkills`, `writeRationale`) porque el LLM
 * no decide, solo extrae y redacta (docs/06). Una conversación libre es un
 * tercer uso distinto — añadirlo al `LlmProvider` real reabriría esa
 * decisión sin que nadie la haya tomado. Vive aquí, con su propio cliente
 * `OpenAI` construido directamente desde `env`, en el mismo espíritu que
 * `/v1/_debug/matchmaker`: una ruta de observación, no parte del producto.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export class SuggestionNotFoundError extends Error {}

const buildSystemPrompt = (input: {
  personName: string;
  personHeadline: string | null;
  teamName: string;
  teamPitch: string | null;
  score: number;
  matchedSkills: Array<{ label: string; priority: string }>;
  rationale: string;
}): string => `
Conversas sobre una sugerencia ya emitida por el MatchMaker de Nodo. No decides
nada nuevo ni generas otra sugerencia: explicas y conversas sobre esta.

Persona: ${input.personName}${input.personHeadline ? ` — ${input.personHeadline}` : ''}
Equipo: ${input.teamName}${input.teamPitch ? ` — ${input.teamPitch}` : ''}
Score: ${input.score}
Coincidencias: ${input.matchedSkills.map((s) => `${s.label} (${s.priority})`).join(', ')}
Rationale original: "${input.rationale}"

Responde en español, tono directo y cercano, 1-3 frases salvo que te pidan más
detalle. No inventes datos que no estén arriba.
`.trim();

export const chatAboutSuggestion = async (
  db: Db,
  env: Env,
  suggestionId: string,
  message: string,
  history: ChatTurn[],
): Promise<string> => {
  const [row] = await db
    .select({
      score: suggestions.score,
      matchedSkills: suggestions.matchedSkills,
      rationale: suggestions.rationale,
      personName: people.displayName,
      personHeadline: people.headline,
      teamName: teams.name,
      teamPitch: teams.pitch,
    })
    .from(suggestions)
    .innerJoin(people, eq(people.id, suggestions.personId))
    .innerJoin(teams, eq(teams.id, suggestions.teamId))
    .where(and(eq(suggestions.id, suggestionId)));

  if (!row) throw new SuggestionNotFoundError(`No existe la sugerencia "${suggestionId}".`);

  const matchedSkills = row.matchedSkills as Array<{ label: string; priority: string }>;

  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const completion = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [
      { role: 'system', content: buildSystemPrompt({ ...row, matchedSkills }) },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: message },
    ],
  });

  return completion.choices[0]?.message.content ?? 'No pude generar una respuesta.';
};

/**
 * Resumen en texto plano del estado actual del grafo — no toda la tabla,
 * solo lo que hace falta para responder preguntas razonables sin alucinar:
 * equipos activos con sus needs, personas buscando con sus skills.
 */
const buildGraphSummary = async (db: Db): Promise<string> => {
  const teamRows = await db.execute(sql`
    select t.name, tn.status,
      coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'priority', e.meta->>'priority'))
        filter (where s.label is not null), '[]') as needs
    from teams t
    join nodes tn on tn.id = t.id
    left join edges e on e.kind = 'needs' and e.from_id = t.id
    left join skills s on s.slug = e.to_id
    where tn.status in ('recruiting', 'almost_full')
    group by t.name, tn.status
    order by t.name
    limit 20
  `);

  const peopleRows = await db.execute(sql`
    select p.display_name,
      coalesce(jsonb_agg(s.label) filter (where s.label is not null), '[]') as skills
    from people p
    join nodes pn on pn.id = p.id
    left join edges e on e.kind = 'has_skill' and e.from_id = p.id
    left join skills s on s.slug = e.to_id
    where pn.status = 'looking'
    group by p.display_name
    order by p.display_name
    limit 30
  `);

  const countRows = (await db.execute(sql`
    select count(*)::int as count from suggestions where status = 'live'
  `)) as unknown as Array<{ count: number }>;
  const liveSuggestions = countRows[0]?.count ?? 0;

  type TeamRow = { name: string; status: string; needs: Array<{ label: string; priority: string }> };
  type PersonRow = { display_name: string; skills: string[] };

  const teamsText = (teamRows as unknown as TeamRow[])
    .map((t) => `- ${t.name} (${t.status}): necesita ${t.needs.map((n) => `${n.label} (${n.priority})`).join(', ') || 'nada declarado aún'}`)
    .join('\n');

  const peopleText = (peopleRows as unknown as PersonRow[])
    .map((p) => `- ${p.display_name}: ${p.skills.join(', ') || 'sin skills registrados'}`)
    .join('\n');

  return `
Equipos reclutando activamente:
${teamsText || '(ninguno ahora mismo)'}

Personas buscando equipo:
${peopleText || '(ninguna ahora mismo)'}

Sugerencias vivas del agente: ${liveSuggestions}
`.trim();
};

const GRAPH_CHAT_SYSTEM_PROMPT_HEADER = `
Conversas sobre el estado actual del grafo de Nodo — la red de personas, equipos
e ideas. Respondes preguntas sobre quién busca equipo, qué necesita cada
equipo, y cómo funciona el matchmaker (docs/06: SQL determinista decide a
quién sugerir, el LLM solo redacta por qué). No inventes personas, equipos ni
skills que no estén en el resumen. Si preguntan algo que no está en los datos,
dilo — no lo completes con suposiciones.

Responde en español, tono directo y cercano, 1-3 frases salvo que pidan más
detalle.
`.trim();

export const chatAboutGraph = async (
  db: Db,
  env: Env,
  message: string,
  history: ChatTurn[],
): Promise<string> => {
  const summary = await buildGraphSummary(db);

  const client = new OpenAI({ apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL });
  const completion = await client.chat.completions.create({
    model: env.LLM_MODEL,
    messages: [
      { role: 'system', content: `${GRAPH_CHAT_SYSTEM_PROMPT_HEADER}\n\n${summary}` },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: message },
    ],
  });

  return completion.choices[0]?.message.content ?? 'No pude generar una respuesta.';
};
