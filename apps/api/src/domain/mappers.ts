import type {
  ApplicationDTO,
  ApplicationStatus,
  Availability,
  IdeaDTO,
  NeedRef,
  PersonDTO,
  PersonRef,
  PersonStatus,
  SkillRef,
  SuggestionDTO,
  SuggestionDirection,
  TeamDTO,
  TeamStatus,
} from '@nodo/contracts';

/**
 * Mapeadores explícitos. El backend **no** serializa filas directamente: una
 * columna nueva no debe filtrarse al contrato por omisión (docs/09).
 *
 * `session_token` y `recovery_code` no aparecen en ninguna función de este
 * archivo, y ese es justamente el punto.
 */

const epoch = (value: Date | string | number): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

export type PersonRow = {
  id: string;
  handle: string;
  displayName: string;
  headline: string | null;
  bioRaw: string | null;
  availability: string;
  language: string;
  createdAt: Date;
};

export const toPersonRef = (row: Pick<PersonRow, 'id' | 'handle' | 'displayName'>): PersonRef => ({
  id: row.id,
  handle: row.handle,
  displayName: row.displayName,
});

export const toPersonDTO = (
  row: PersonRow,
  status: PersonStatus,
  teamId: string | null,
): PersonDTO => ({
  id: row.id,
  handle: row.handle,
  displayName: row.displayName,
  headline: row.headline,
  bio: row.bioRaw,
  availability: row.availability as Availability,
  language: row.language,
  status,
  teamId,
  createdAt: epoch(row.createdAt),
});

export type TeamRow = {
  id: string;
  name: string;
  pitch: string | null;
  ideaId: string | null;
  maxSize: number;
  createdAt: Date;
};

export const toTeamDTO = (
  row: TeamRow,
  status: TeamStatus,
  lead: PersonRef,
  members: PersonRef[],
  needs: NeedRef[],
): TeamDTO => ({
  id: row.id,
  name: row.name,
  pitch: row.pitch,
  status,
  lead,
  members,
  needs,
  ideaId: row.ideaId,
  maxSize: row.maxSize,
  createdAt: epoch(row.createdAt),
});

export type IdeaRow = {
  id: string;
  title: string;
  summary: string | null;
  createdAt: Date;
};

export const toIdeaDTO = (
  row: IdeaRow,
  author: PersonRef,
  teamId: string | null,
  interestedCount: number,
): IdeaDTO => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  author,
  teamId,
  interestedCount,
  createdAt: epoch(row.createdAt),
});

/**
 * `teamName` y `leadId` van embebidos porque el bridge `notify` corre dentro
 * de Portal, sin acceso a la base de datos: si no viajan aquí, la
 * notificación no llega y nadie se entera (docs/09).
 */
export const toApplicationDTO = (input: {
  id: string;
  person: PersonRef;
  teamId: string;
  teamName: string;
  leadId: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: Date | number;
  resolvedAt: Date | number | null;
}): ApplicationDTO => ({
  id: input.id,
  person: input.person,
  teamId: input.teamId,
  teamName: input.teamName,
  leadId: input.leadId,
  status: input.status,
  message: input.message,
  createdAt: epoch(input.createdAt),
  resolvedAt: input.resolvedAt === null ? null : epoch(input.resolvedAt),
});

export const toSuggestionDTO = (input: {
  id: string;
  personId: string;
  personName: string;
  teamId: string;
  teamName: string;
  score: number;
  direction: SuggestionDirection;
  matchedSkills: NeedRef[];
  rationale: string;
  expiresAt: Date | number;
  createdAt: Date | number;
}): SuggestionDTO => ({
  id: input.id,
  personId: input.personId,
  personName: input.personName,
  teamId: input.teamId,
  teamName: input.teamName,
  score: input.score,
  direction: input.direction,
  matchedSkills: input.matchedSkills,
  rationale: input.rationale,
  expiresAt: epoch(input.expiresAt),
  createdAt: epoch(input.createdAt),
});

export const toSkillRef = (row: { slug: string; label: string; category: string }): SkillRef => ({
  slug: row.slug,
  label: row.label,
  category: row.category as SkillRef['category'],
});

export const toNeedRef = (
  row: { slug: string; label: string; category: string },
  priority: NeedRef['priority'],
): NeedRef => ({ ...toSkillRef(row), priority });
