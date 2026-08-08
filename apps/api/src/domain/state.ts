import type { ApplicationStatus, PersonStatus, TeamStatus } from '@nodo/contracts';
import { errors } from './errors.js';

/**
 * Cascada de `Team.status` (docs/02). **El primer caso que aplica gana**, y el
 * orden es parte de la definición: sin él, un equipo con `maxSize - 1`
 * integrantes y needs sin cubrir satisface dos condiciones a la vez.
 *
 * `recruiting` es el caso por defecto y no exige needs sin cubrir: un equipo
 * con hueco está reclutando aunque todavía no haya declarado qué le falta.
 */
export const deriveTeamStatus = (input: {
  frozen: boolean;
  memberCount: number;
  maxSize: number;
}): TeamStatus => {
  if (input.frozen) return 'building';
  if (input.memberCount >= input.maxSize) return 'complete';
  if (input.memberCount === input.maxSize - 1) return 'almost_full';
  return 'recruiting';
};

/** Guardarraíl 6 de docs/06: el agente no sugiere a estos equipos. */
export const teamAcceptsSuggestions = (status: TeamStatus): boolean =>
  status === 'recruiting' || status === 'almost_full';

/** Guardarraíl 5: solo las personas `looking` son candidatas. */
export const personAcceptsSuggestions = (status: PersonStatus): boolean => status === 'looking';

/**
 * `teamed` no se escribe a mano: se deriva de aceptar una solicitud
 * (invariante 5). Solo `looking` e `idle` son transiciones de la persona.
 */
export const assertPersonStatusTransition = (
  current: PersonStatus,
  next: 'looking' | 'idle',
): void => {
  if (current === 'teamed') {
    throw errors.forbidden(
      'Estás en un equipo. Sal de él para volver a buscar o marcarte no disponible.',
    );
  }
  if (current === next) return;
};

const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['accepted', 'rejected', 'withdrawn', 'auto_rejected'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  auto_rejected: [],
};

export const canTransitionApplication = (
  current: ApplicationStatus,
  next: ApplicationStatus,
): boolean => APPLICATION_TRANSITIONS[current].includes(next);

export const assertApplicationTransition = (
  current: ApplicationStatus,
  next: ApplicationStatus,
): void => {
  if (!canTransitionApplication(current, next)) {
    throw errors.forbidden(`Esta solicitud ya está ${current} y no puede cambiar.`);
  }
};
