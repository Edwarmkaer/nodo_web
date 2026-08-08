import { z } from 'zod';
import { ApplicationDTO, IdeaDTO, PersonDTO, TeamDTO } from './dto.js';
import { GraphEdge, GraphNode } from './graph.js';
import {
  Availability,
  Handle,
  IdeaId,
  LanguageCode,
  MAX_TEAM_SIZE,
  NeedPriority,
  PersonId,
  SkillRef,
} from './primitives.js';

/**
 * Un `slug` del vocabulario canónico. La pertenencia al vocabulario no se
 * valida aquí sino contra `skills ∪ skill_aliases` en el borde del backend,
 * que es donde vive la tabla; un slug desconocido devuelve `UNKNOWN_SKILL`
 * (invariante 6).
 */
const SkillSlug = z.string().min(1);

const NeedInput = z.object({ slug: SkillSlug, priority: NeedPriority });

// ─── Peticiones ─────────────────────────────────────────────────────────────

/**
 * `POST /v1/people` — única ruta de escritura sin autenticar: es la que acuña
 * la credencial (ADR-006).
 *
 * Si llega `bioRaw` y `skills` va vacío, el backend ejecuta el extractor de
 * forma síncrona antes de responder, para que nadie vea un perfil sin skills.
 */
export const CreatePersonRequest = z.object({
  displayName: z.string().min(1),
  handle: Handle,
  headline: z.string().nullish(),
  bioRaw: z.string().nullish(),
  /** Selección manual. Sustituye a la extracción por LLM cuando viene. */
  skills: z.array(SkillSlug).optional(),
  availability: Availability.optional(),
  language: LanguageCode.optional(),
});
export type CreatePersonRequest = z.infer<typeof CreatePersonRequest>;

export const UpdatePersonRequest = CreatePersonRequest.omit({ handle: true }).partial();
export type UpdatePersonRequest = z.infer<typeof UpdatePersonRequest>;

/**
 * `teamed` no se escribe: se deriva de aceptar una solicitud (invariante 5).
 */
export const UpdatePersonStatusRequest = z.object({
  status: z.enum(['looking', 'idle']),
});
export type UpdatePersonStatusRequest = z.infer<typeof UpdatePersonStatusRequest>;

export const RecoverSessionRequest = z.object({
  recoveryCode: z.string().min(1),
});
export type RecoverSessionRequest = z.infer<typeof RecoverSessionRequest>;

export const ExtractSkillsRequest = z.object({
  text: z.string().min(1),
});
export type ExtractSkillsRequest = z.infer<typeof ExtractSkillsRequest>;

export const CreateIdeaRequest = z.object({
  title: z.string().min(1),
  summary: z.string().nullish(),
});
export type CreateIdeaRequest = z.infer<typeof CreateIdeaRequest>;

export const CreateTeamRequest = z.object({
  name: z.string().min(1),
  pitch: z.string().nullish(),
  ideaId: IdeaId.nullish(),
  needs: z.array(NeedInput).default([]),
  maxSize: z.number().int().min(1).max(MAX_TEAM_SIZE).optional(),
});
export type CreateTeamRequest = z.infer<typeof CreateTeamRequest>;

export const UpdateTeamRequest = z.object({
  name: z.string().min(1).optional(),
  pitch: z.string().nullish(),
  /** `true` congela el reclutamiento: es el estado `building` (docs/02). */
  frozen: z.boolean().optional(),
});
export type UpdateTeamRequest = z.infer<typeof UpdateTeamRequest>;

/** Reemplaza el conjunto completo de needs. No es un parche. */
export const ReplaceNeedsRequest = z.object({
  needs: z.array(NeedInput),
});
export type ReplaceNeedsRequest = z.infer<typeof ReplaceNeedsRequest>;

export const CreateApplicationRequest = z.object({
  message: z.string().nullish(),
});
export type CreateApplicationRequest = z.infer<typeof CreateApplicationRequest>;

export const ResolveApplicationRequest = z.object({
  action: z.enum(['accept', 'reject']),
});
export type ResolveApplicationRequest = z.infer<typeof ResolveApplicationRequest>;

// ─── Respuestas ─────────────────────────────────────────────────────────────

/**
 * `POST /v1/people`. `sessionToken` y `recoveryCode` viajan aquí y en ningún
 * otro sitio: no aparecen en ningún DTO (docs/09).
 */
export const CreatePersonResponse = z.object({
  person: PersonDTO,
  skills: z.array(SkillRef),
  sessionToken: z.string().min(1),
  recoveryCode: z.string().min(1),
});
export type CreatePersonResponse = z.infer<typeof CreatePersonResponse>;

/** `POST /v1/session/recover`. El `sessionToken` anterior queda anulado. */
export const RecoverSessionResponse = z.object({
  personId: PersonId,
  sessionToken: z.string().min(1),
});
export type RecoverSessionResponse = z.infer<typeof RecoverSessionResponse>;

/**
 * `POST /v1/portal/token`. El cliente lo pide desde un callback `async` del
 * SDK; guardarlo como string estático produce `TokenExpiredError` a los 15 min.
 */
export const PortalTokenResponse = z.object({
  token: z.string().min(1),
  /** Segundos. 900. */
  expiresIn: z.number().int().positive(),
});
export type PortalTokenResponse = z.infer<typeof PortalTokenResponse>;

/**
 * `GET /v1/graph`. `seq` es la marca de agua de `network-main` en el momento
 * del snapshot, y se lee antes que el grafo (ADR-009).
 */
export const GraphSnapshot = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  seq: z.number().int().nonnegative(),
});
export type GraphSnapshot = z.infer<typeof GraphSnapshot>;

export const PersonResponse = z.object({ person: PersonDTO, skills: z.array(SkillRef) });
export type PersonResponse = z.infer<typeof PersonResponse>;

/** `TeamDTO` ya incluye `needs` y `members`; no viajan como campos aparte. */
export const TeamResponse = z.object({ team: TeamDTO });
export type TeamResponse = z.infer<typeof TeamResponse>;

/** `GET /v1/teams`. No estaba en docs/09 — es la forma obvia del listado, análoga a `SkillsResponse`. */
export const TeamsResponse = z.object({ teams: z.array(TeamDTO) });
export type TeamsResponse = z.infer<typeof TeamsResponse>;

export const IdeaResponse = z.object({ idea: IdeaDTO });
export type IdeaResponse = z.infer<typeof IdeaResponse>;

/** `GET /v1/ideas`. Misma nota que `TeamsResponse`. */
export const IdeasResponse = z.object({ ideas: z.array(IdeaDTO) });
export type IdeasResponse = z.infer<typeof IdeasResponse>;

export const ApplicationResponse = z.object({ application: ApplicationDTO });
export type ApplicationResponse = z.infer<typeof ApplicationResponse>;

/** `GET /v1/teams/:id/applications`. Misma nota que `TeamsResponse`. */
export const ApplicationsResponse = z.object({ applications: z.array(ApplicationDTO) });
export type ApplicationsResponse = z.infer<typeof ApplicationsResponse>;

export const SkillsResponse = z.object({ skills: z.array(SkillRef) });
export type SkillsResponse = z.infer<typeof SkillsResponse>;

export const ExtractSkillsResponse = z.object({
  skills: z.array(SkillRef.extend({ confidence: z.number().min(0).max(1) })),
});
export type ExtractSkillsResponse = z.infer<typeof ExtractSkillsResponse>;

// ─── Errores ────────────────────────────────────────────────────────────────

export const ErrorCode = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'HANDLE_TAKEN',
  'TEAM_FULL',
  'ALREADY_IN_TEAM',
  'DUPLICATE_APPLICATION',
  'UNKNOWN_SKILL',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** `DUPLICATE_APPLICATION` devuelve la solicitud existente en `details.application`. */
export const ApiError = z.object({
  error: ErrorCode,
  /** Texto para persona usuaria, en español. */
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const HTTP_STATUS_BY_ERROR: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  HANDLE_TAKEN: 409,
  TEAM_FULL: 409,
  ALREADY_IN_TEAM: 409,
  DUPLICATE_APPLICATION: 409,
  UNKNOWN_SKILL: 422,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
};
