import { loadEnv } from '../config.js';
import { createDb } from './client.js';
import { nodes, skillAliases, skills } from './schema.js';
import { SKILLS, SKILL_ALIASES } from './vocabulary.js';
import { createPerson } from './people-repo.js';
import { addMember, createTeam, deriveAndPersistTeamStatus } from './teams-repo.js';
import { createIdea } from './ideas-repo.js';
import { personId, recoveryCode, sessionToken, teamId, ideaId } from '../domain/ids.js';
import type { SkillRef } from '@nodo/contracts';

/**
 * `pnpm db:seed` (docs/08). Dos conjuntos con propósitos distintos:
 *
 * - **Vocabulario** — obligatorio en cualquier entorno. Sin él no hay
 *   matching (ADR-002). Incluye el nodo del agente: `matchmaker` está
 *   presente desde el seed, no se crea en runtime (docs/06).
 * - **Conjunto representativo** — solo en desarrollo. No incluye
 *   sugerencias: las genera el agente al arrancar, que es lo que interesa
 *   observar.
 */
const seedVocabulary = async (db: ReturnType<typeof createDb>['db']): Promise<void> => {
  for (const skill of SKILLS) {
    await db.insert(skills).values(skill).onConflictDoNothing();
    await db
      .insert(nodes)
      .values({ id: skill.slug, kind: 'skill', label: skill.label, meta: { category: skill.category } })
      .onConflictDoNothing();
  }
  for (const alias of SKILL_ALIASES) {
    await db.insert(skillAliases).values(alias).onConflictDoNothing();
  }
  await db
    .insert(nodes)
    .values({ id: 'matchmaker', kind: 'agent', label: 'MatchMaker' })
    .onConflictDoNothing();

  console.log(`[seed] vocabulario: ${SKILLS.length} skills, ${SKILL_ALIASES.length} alias.`);
};

const skill = (slug: string): SkillRef => {
  const found = SKILLS.find((s) => s.slug === slug);
  if (!found) throw new Error(`Seed: slug "${slug}" no está en el vocabulario.`);
  return found;
};

const seedPerson = async (
  db: ReturnType<typeof createDb>['db'],
  input: {
    handle: string;
    displayName: string;
    headline: string;
    bioRaw: string;
    skillSlugs: string[];
    availability: 'full' | 'partial' | 'evenings';
    language: string;
  },
): Promise<string> => {
  const id = personId();
  await createPerson(db, {
    id,
    handle: input.handle,
    displayName: input.displayName,
    headline: input.headline,
    bioRaw: input.bioRaw,
    availability: input.availability,
    language: input.language,
    sessionToken: sessionToken(),
    recoveryCode: recoveryCode(),
    skills: input.skillSlugs.map(skill),
  });
  return id;
};

/** Conjunto representativo, solo desarrollo: variedad de estados y categorías. */
const seedRepresentativeSet = async (db: ReturnType<typeof createDb>['db']): Promise<void> => {
  const laura = await seedPerson(db, {
    handle: 'laura',
    displayName: 'Laura Gómez',
    headline: 'Backend + datos',
    bioRaw: 'Trabajo con Go, PostgreSQL y RAG.',
    skillSlugs: ['go', 'postgresql', 'rag', 'backend', 'data-ai'],
    availability: 'full',
    language: 'es',
  });

  const camilo = await seedPerson(db, {
    handle: 'camilo',
    displayName: 'Camilo Restrepo',
    headline: 'Frontend',
    bioRaw: 'Angular, TypeScript y un poco de Figma.',
    skillSlugs: ['angular', 'typescript', 'frontend', 'figma'],
    availability: 'full',
    language: 'es',
  });

  const nadia = await seedPerson(db, {
    handle: 'nadia',
    displayName: 'Nadia Kahn',
    headline: 'Producto',
    bioRaw: 'Pitching, investigación de usuarios y modelo de negocio.',
    skillSlugs: ['product', 'pitching', 'user-research'],
    availability: 'partial',
    language: 'en',
  });

  const santi = await seedPerson(db, {
    handle: 'santi',
    displayName: 'Santiago Ruiz',
    headline: 'Diseño de producto',
    bioRaw: 'Figma, sistemas de diseño, prototipado.',
    skillSlugs: ['figma', 'ui-design', 'design-systems'],
    availability: 'full',
    language: 'es',
  });

  const mei = await seedPerson(db, {
    handle: 'mei',
    displayName: 'Mei Zhang',
    headline: 'ML / Datos',
    bioRaw: 'Python, machine learning, visualización de datos.',
    skillSlugs: ['python', 'ml', 'data-viz', 'data-ai'],
    availability: 'evenings',
    language: 'en',
  });

  const diego = await seedPerson(db, {
    handle: 'diego',
    displayName: 'Diego Fernández',
    headline: 'Infra',
    bioRaw: 'Docker, AWS, CI/CD.',
    skillSlugs: ['docker', 'aws', 'ci-cd', 'infra'],
    availability: 'full',
    language: 'es',
  });

  const healthIdea = ideaId();
  await createIdea(db, {
    id: healthIdea,
    title: 'Health AI',
    summary: 'Asistente de triaje para clínicas rurales.',
    authorId: laura,
  });

  // recruiting: 1/4, needs sin cubrir.
  await createTeam(db, {
    id: teamId(),
    name: 'Health AI',
    pitch: 'Asistente de triaje para clínicas rurales.',
    leadId: laura,
    ideaId: healthIdea,
    maxSize: 4,
    needs: [
      { ...skill('go'), priority: 'required' },
      { ...skill('figma'), priority: 'nice' },
    ],
  });

  // almost_full: 3/4. Nadia lidera; Camilo y Santi ya se unieron.
  const growthTeamId = teamId();
  await createTeam(db, {
    id: growthTeamId,
    name: 'Growth Lab',
    pitch: 'Herramienta de crecimiento para founders early-stage.',
    leadId: nadia,
    ideaId: null,
    maxSize: 4,
    needs: [{ ...skill('growth'), priority: 'required' }],
  });
  await addMember(db, growthTeamId, camilo);
  await addMember(db, growthTeamId, santi);
  await deriveAndPersistTeamStatus(db, growthTeamId, false);

  // Mei y Diego (creados arriba) quedan `looking`, sin equipo: el fondo de
  // candidatos que el matchmaker evalúa al arrancar contra las needs de
  // arriba — ninguno calza con `go`/`figma`/`growth`, a propósito: el AC-02
  // real se ejercita sembrando el par exacto, no dependiendo de este conjunto.

  console.log('[seed] conjunto representativo: 6 personas, 1 idea, 2 equipos.');
};

const main = async (): Promise<void> => {
  const env = loadEnv();
  const { sql, db } = createDb(env.DATABASE_URL, { max: 1 });

  await seedVocabulary(db);
  if (env.NODE_ENV !== 'production') {
    await seedRepresentativeSet(db);
  }

  await sql.end();
  console.log('[seed] listo.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
