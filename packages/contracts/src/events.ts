import { z } from 'zod';
import { ApplicationDTO, IdeaDTO, PersonDTO, SuggestionDTO, TeamDTO } from './dto.js';
import { mainEnvelope, teamEnvelope, type NoGraph } from './envelope.js';
import {
  NeedRef,
  PersonId,
  PersonRef,
  PersonStatus,
  SkillRef,
  SuggestionId,
  TeamId,
  TeamStatus,
} from './primitives.js';

// ─── Canales ────────────────────────────────────────────────────────────────
// Un solo canal público. Las vistas filtradas son cosa del cliente
// (`room.view()`), no de abrir sockets extra (docs/03).

export const MAIN_CHANNEL = 'network-main';
export const teamChannel = (teamId: string): string => `team-${teamId}`;

// ─── network-main ───────────────────────────────────────────────────────────

export const PersonUpserted = mainEnvelope(
  'person.upserted',
  z.object({ person: PersonDTO, skills: z.array(SkillRef) }),
);

export const PersonStatusChanged = mainEnvelope(
  'person.status_changed',
  z.object({ personId: PersonId, status: PersonStatus, previous: PersonStatus }),
);

export const IdeaPublished = mainEnvelope('idea.published', z.object({ idea: IdeaDTO }));

export const TeamCreated = mainEnvelope('team.created', z.object({ team: TeamDTO }));

export const TeamUpdated = mainEnvelope('team.updated', z.object({ team: TeamDTO }));

export const TeamMemberJoined = mainEnvelope(
  'team.member_joined',
  z.object({ teamId: TeamId, person: PersonRef, status: TeamStatus }),
);

export const TeamMemberLeft = mainEnvelope(
  'team.member_left',
  z.object({ teamId: TeamId, personId: PersonId, status: TeamStatus }),
);

export const MatchSuggested = mainEnvelope(
  'match.suggested',
  z.object({ suggestion: SuggestionDTO }),
);

/**
 * Retira una sugerencia del grafo. Lo emite tanto la caducidad por tiempo como
 * el desplazamiento por tope (guardarraíles 2, 3 y 4 de docs/06): en ambos
 * casos la arista tiene que desaparecer y este es el único sobre que lo hace.
 */
export const MatchExpired = mainEnvelope(
  'match.expired',
  z.object({ suggestionId: SuggestionId }),
);

export const MainEvent = z.discriminatedUnion('type', [
  PersonUpserted,
  PersonStatusChanged,
  IdeaPublished,
  TeamCreated,
  TeamUpdated,
  TeamMemberJoined,
  TeamMemberLeft,
  MatchSuggested,
  MatchExpired,
]);
export type MainEvent = z.infer<typeof MainEvent>;

// ─── team-{teamId} ──────────────────────────────────────────────────────────
// Las applications no se publican en `network-main`: quién solicita a qué
// equipo es información sensible y no aparece en el grafo público (docs/03).

export const ApplicationCreated = teamEnvelope(
  'application.created',
  z.object({ application: ApplicationDTO }),
);

export const ApplicationResolved = teamEnvelope(
  'application.resolved',
  z.object({ application: ApplicationDTO }),
);

export const TeamNeedChanged = teamEnvelope(
  'team.need_changed',
  z.object({ teamId: TeamId, needs: z.array(NeedRef) }),
);

export const TeamEvent = z.discriminatedUnion('type', [
  ApplicationCreated,
  ApplicationResolved,
  TeamNeedChanged,
]);
export type TeamEvent = NoGraph<z.infer<typeof TeamEvent>>;

export const AnyEvent = z.union([MainEvent, TeamEvent]);
export type AnyEvent = MainEvent | TeamEvent;
