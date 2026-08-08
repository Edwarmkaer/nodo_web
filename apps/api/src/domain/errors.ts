import { HTTP_STATUS_BY_ERROR, type ApiError, type ErrorCode } from '@nodo/contracts';

/**
 * Error de dominio. Lleva su propio código del contrato, así que la capa HTTP
 * lo traduce a una respuesta sin conocer la regla que lo produjo.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return HTTP_STATUS_BY_ERROR[this.code];
  }

  toApiError(): ApiError {
    return this.details === undefined
      ? { error: this.code, message: this.message }
      : { error: this.code, message: this.message, details: this.details };
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;

/** Mensajes en español, dirigidos a la persona usuaria (docs/09). */
export const errors = {
  unauthenticated: () =>
    new DomainError('UNAUTHENTICATED', 'Necesitas una sesión válida para hacer esto.'),

  forbidden: (detalle = 'No tienes permiso para hacer esto.') =>
    new DomainError('FORBIDDEN', detalle),

  notFound: (que = 'No encontramos lo que buscabas.') => new DomainError('NOT_FOUND', que),

  handleTaken: (handle: string) =>
    new DomainError('HANDLE_TAKEN', `El handle "${handle}" ya está en uso.`, { handle }),

  teamFull: (maxSize: number) =>
    new DomainError('TEAM_FULL', `El equipo ya tiene ${maxSize} integrantes.`, { maxSize }),

  alreadyInTeam: () =>
    new DomainError('ALREADY_IN_TEAM', 'Ya perteneces a un equipo. Sal de él antes de unirte a otro.'),

  duplicateApplication: (application: unknown) =>
    new DomainError('DUPLICATE_APPLICATION', 'Ya tienes una solicitud pendiente en este equipo.', {
      application,
    }),

  unknownSkill: (slugs: string[]) =>
    new DomainError(
      'UNKNOWN_SKILL',
      `Estos skills no están en el vocabulario: ${slugs.join(', ')}.`,
      { slugs },
    ),

  validation: (issues: unknown) =>
    new DomainError('VALIDATION_ERROR', 'Los datos enviados no son válidos.', { issues }),

  rateLimited: () =>
    new DomainError('RATE_LIMITED', 'Demasiadas peticiones. Espera un momento.'),
} as const;
