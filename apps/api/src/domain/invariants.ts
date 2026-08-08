import { errors } from './errors.js';

/**
 * Comprobaciones que **también** existen como constraint en Postgres
 * (docs/02, docs/10: "un invariante que solo vive en el código no es un
 * invariante"). Vivir aquí además sirve para devolver el código de error
 * correcto antes de que la base de datos devuelva una violación genérica.
 */

/** Invariante 2. */
export const assertTeamNotFull = (memberCount: number, maxSize: number): void => {
  if (memberCount >= maxSize) throw errors.teamFull(maxSize);
};

/** Invariante 1. */
export const assertPersonNotInTeam = (currentTeamId: string | null): void => {
  if (currentTeamId !== null) throw errors.alreadyInTeam();
};

/**
 * Invariante 6: los skills son vocabulario cerrado. `resolveSkillSlug`
 * intenta primero el slug directo y luego la tabla de alias; un slug que no
 * resuelve en ninguna se acumula para el `422 UNKNOWN_SKILL`.
 */
export const assertKnownSkills = (
  requested: string[],
  resolve: (slug: string) => string | undefined,
): string[] => {
  const resolved: string[] = [];
  const unknown: string[] = [];
  for (const slug of requested) {
    const canonical = resolve(slug);
    if (canonical === undefined) unknown.push(slug);
    else resolved.push(canonical);
  }
  if (unknown.length > 0) throw errors.unknownSkill(unknown);
  return resolved;
};
