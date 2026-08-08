import { z } from 'zod';
import {
  ApplicationId,
  ApplicationStatus,
  Availability,
  EpochMs,
  Handle,
  IdeaId,
  LanguageCode,
  MAX_TEAM_SIZE,
  NeedRef,
  PersonId,
  PersonRef,
  PersonStatus,
  SuggestionDirection,
  SuggestionId,
  TeamId,
  TeamStatus,
} from './primitives.js';

/**
 * Regla de exposición (docs/09): `session_token` y `recovery_code` existen en
 * la base de datos y no aparecen en ningún DTO. Se devuelven una sola vez, en
 * la respuesta que los acuña (ver `rest.ts`).
 */
export const PersonDTO = z.object({
  id: PersonId,
  handle: Handle,
  displayName: z.string().min(1),
  headline: z.string().nullable(),
  /** Texto libre que la persona escribió. Público. */
  bio: z.string().nullable(),
  availability: Availability,
  language: LanguageCode,
  status: PersonStatus,
  /** `MEMBER_OF` materializado. Como máximo uno (invariante 1). */
  teamId: TeamId.nullable(),
  createdAt: EpochMs,
});
export type PersonDTO = z.infer<typeof PersonDTO>;

/**
 * `members` viaja completo porque `maxSize` lo acota a 4 como mucho, y `lead`
 * está siempre incluido en él (invariante 3).
 */
export const TeamDTO = z.object({
  id: TeamId,
  name: z.string().min(1),
  pitch: z.string().nullable(),
  /** Derivado por cascada salvo `building` (docs/02). */
  status: TeamStatus,
  lead: PersonRef,
  members: z.array(PersonRef).min(1).max(MAX_TEAM_SIZE),
  needs: z.array(NeedRef),
  ideaId: IdeaId.nullable(),
  maxSize: z.number().int().min(1).max(MAX_TEAM_SIZE),
  createdAt: EpochMs,
});
export type TeamDTO = z.infer<typeof TeamDTO>;

export const IdeaDTO = z.object({
  id: IdeaId,
  title: z.string().min(1),
  summary: z.string().nullable(),
  author: PersonRef,
  /** Arista `SPAWNED`, si la idea ya derivó en equipo. */
  teamId: TeamId.nullable(),
  interestedCount: z.number().int().nonnegative(),
  createdAt: EpochMs,
});
export type IdeaDTO = z.infer<typeof IdeaDTO>;

/**
 * `teamName` y `leadId` están denormalizados a propósito: el bridge `notify`
 * corre dentro de Portal, sin acceso a la base de datos, y solo puede leer el
 * `content` del mensaje. Quitarlos rompe las notificaciones en silencio.
 */
export const ApplicationDTO = z.object({
  id: ApplicationId,
  person: PersonRef,
  teamId: TeamId,
  teamName: z.string().min(1),
  leadId: PersonId,
  status: ApplicationStatus,
  message: z.string().nullable(),
  createdAt: EpochMs,
  resolvedAt: EpochMs.nullable(),
});
export type ApplicationDTO = z.infer<typeof ApplicationDTO>;

/**
 * `personName` y `teamName` los exige el mismo bridge `notify`, por el mismo
 * motivo que en `ApplicationDTO`.
 *
 * `matchedSkills` no puede venir vacío: el rationale tiene que nombrar skills
 * concretos y sin coincidencias no hay nada que nombrar (docs/06).
 */
export const SuggestionDTO = z.object({
  id: SuggestionId,
  personId: PersonId,
  personName: z.string().min(1),
  teamId: TeamId,
  teamName: z.string().min(1),
  score: z.number().nonnegative(),
  direction: SuggestionDirection,
  matchedSkills: z.array(NeedRef).min(1),
  rationale: z.string().min(1),
  expiresAt: EpochMs,
  createdAt: EpochMs,
});
export type SuggestionDTO = z.infer<typeof SuggestionDTO>;
