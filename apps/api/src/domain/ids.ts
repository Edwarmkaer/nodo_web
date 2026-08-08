import { randomBytes, randomInt } from 'node:crypto';

/** Crockford base32: sin I, L, O ni U, para que no se confundan al leerlas. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const encodeTime = (ms: number, length: number): string => {
  let out = '';
  let rest = ms;
  for (let i = length - 1; i >= 0; i -= 1) {
    out = CROCKFORD[rest % 32] + out;
    rest = Math.floor(rest / 32);
  }
  return out;
};

const encodeRandom = (length: number): string => {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD[bytes[i]! % 32];
  return out;
};

/**
 * ULID: 10 caracteres de timestamp + 16 aleatorios.
 *
 * Ordenable por tiempo, que es lo que hace que `order by id` y
 * `order by created_at` coincidan sin un índice extra.
 */
export const ulid = (now = Date.now()): string => encodeTime(now, 10) + encodeRandom(16);

/**
 * El prefijo es parte del contrato (docs/09) y lo valida `@nodo/contracts`:
 * confundir un `teamId` con un `personId` deja de ser posible en silencio.
 */
export const personId = (): string => `per_${ulid()}`;
export const teamId = (): string => `tm_${ulid()}`;
export const ideaId = (): string => `idea_${ulid()}`;
export const applicationId = (): string => `app_${ulid()}`;
export const suggestionId = (): string => `sug_${ulid()}`;
export const eventId = (): string => `evt_${ulid()}`;

/** Credencial de sesión opaca. 256 bits, nunca sale en un DTO. */
export const sessionToken = (): string => randomBytes(32).toString('base64url');

/**
 * Código de recuperación de 6 caracteres (ADR-006). Se muestra una vez.
 * Sin vocales para que no forme palabras y con el alfabeto de Crockford para
 * que no haya ambigüedad al dictarlo.
 */
export const recoveryCode = (): string => {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CROCKFORD[randomInt(CROCKFORD.length)];
  return out;
};
