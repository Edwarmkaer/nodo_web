import type { NeedRef } from '@nodo/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export type Candidate = {
  id: string;
  label: string;
  score: number;
  matchedSkills: NeedRef[];
};

/**
 * Las dos direcciones del scoring de docs/04 y docs/06, detrás de una
 * interfaz: el `MatchmakerService` no sabe que esto es SQL.
 */
export interface CandidateRepository {
  /** Dirección `team_needs_person`. `teamLanguage` es el idioma del líder. */
  forTeam(teamId: string, teamLanguage: string, threshold: number): Promise<Candidate[]>;
  /** Dirección `person_seeks_team`. El idioma de cada equipo se resuelve por su líder, dentro de la consulta. */
  forPerson(personId: string, threshold: number): Promise<Candidate[]>;
}

type CandidateRow = { id: string; label: string; score: number | string; matched_skills: unknown };

const toCandidate = (row: CandidateRow): Candidate => ({
  id: row.id,
  label: row.label,
  score: typeof row.score === 'string' ? Number(row.score) : row.score,
  matchedSkills: row.matched_skills as NeedRef[],
});

/**
 * Traducción literal de las consultas de docs/04 (`team_needs_person`) y
 * docs/06 (`person_seeks_team`), con el score completo calculado en SQL y el
 * umbral aplicado antes del `limit` — la corrección que motivó la sesión de
 * revisión de la especificación.
 */
export class DrizzleCandidateRepository implements CandidateRepository {
  constructor(private readonly db: Db) {}

  async forTeam(teamId: string, teamLanguage: string, threshold: number): Promise<Candidate[]> {
    const result = await this.db.execute(sql`
      select * from (
        select
          p.id,
          p.label,
          p.created_at,
            sum(case when e_need.meta->>'priority' = 'required' then 2 else 1 end)
          + (case when pe.availability = 'full' then 1 else 0 end)
          + (case when pe.language     = ${teamLanguage} then 1 else 0 end)   as score,
          jsonb_agg(jsonb_build_object(
            'slug',     s.slug,
            'label',    s.label,
            'category', s.category,
            'priority', e_need.meta->>'priority'
          )) as matched_skills
        from edges  e_need
        join edges  e_skill on e_skill.kind  = 'has_skill'
                           and e_skill.to_id = e_need.to_id
        join nodes  p       on p.id   = e_skill.from_id
        join people pe      on pe.id  = p.id
        join skills s       on s.slug = e_need.to_id
        where e_need.kind    = 'needs'
          and e_need.from_id = ${teamId}
          and p.kind         = 'person'
          and p.status       = 'looking'
          and not exists (
            select 1 from edges m
             where m.kind = 'member_of' and m.from_id = p.id
          )
        group by p.id, p.label, p.created_at, pe.availability, pe.language
      ) c
      where c.score >= ${threshold}
      order by c.score desc, c.created_at asc
      limit 5
    `);
    return (result as unknown as CandidateRow[]).map(toCandidate);
  }

  async forPerson(personId: string, threshold: number): Promise<Candidate[]> {
    const result = await this.db.execute(sql`
      select * from (
        select
          t.id,
          t.label,
            sum(case when e_need.meta->>'priority' = 'required' then 2 else 1 end)
          + (case when me.availability = 'full'        then 1 else 0 end)
          + (case when me.language     = lead.language  then 1 else 0 end)   as score,
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
        join people me     on me.id  = ${personId}
        join skills s      on s.slug = e_need.to_id
        where e_skill.kind    = 'has_skill'
          and e_skill.from_id = ${personId}
          and t.kind          = 'team'
          and t.status in ('recruiting','almost_full')
        group by t.id, t.label, me.availability, me.language, lead.language
      ) c
      where c.score >= ${threshold}
      order by c.score desc
      limit 3
    `);
    return (result as unknown as CandidateRow[]).map(toCandidate);
  }
}

/** Doble de pruebas: candidatos fijados a mano, sin Postgres. */
export class FakeCandidateRepository implements CandidateRepository {
  constructor(
    private readonly teamCandidates: Record<string, Candidate[]> = {},
    private readonly personCandidates: Record<string, Candidate[]> = {},
  ) {}

  async forTeam(teamId: string): Promise<Candidate[]> {
    return this.teamCandidates[teamId] ?? [];
  }

  async forPerson(personId: string): Promise<Candidate[]> {
    return this.personCandidates[personId] ?? [];
  }
}
