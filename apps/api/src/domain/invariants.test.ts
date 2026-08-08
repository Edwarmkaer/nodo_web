import { describe, expect, it } from 'vitest';
import { assertKnownSkills, assertPersonNotInTeam, assertTeamNotFull } from './invariants.js';
import { isDomainError } from './errors.js';

describe('invariante 2 — tope de equipo', () => {
  it('no lanza con hueco disponible', () => {
    expect(() => assertTeamNotFull(3, 4)).not.toThrow();
  });

  it('lanza TEAM_FULL al llegar al máximo', () => {
    try {
      assertTeamNotFull(4, 4);
      expect.unreachable();
    } catch (error) {
      expect(isDomainError(error) && error.code).toBe('TEAM_FULL');
    }
  });
});

describe('invariante 1 — una persona, un equipo', () => {
  it('permite unirse si no está en ninguno', () => {
    expect(() => assertPersonNotInTeam(null)).not.toThrow();
  });

  it('bloquea si ya pertenece a un equipo', () => {
    try {
      assertPersonNotInTeam('tm_otro');
      expect.unreachable();
    } catch (error) {
      expect(isDomainError(error) && error.code).toBe('ALREADY_IN_TEAM');
    }
  });
});

describe('invariante 6 — vocabulario cerrado', () => {
  const resolve = (slug: string): string | undefined =>
    ({ go: 'go', golang: 'go' })[slug];

  it('resuelve slugs directos y alias', () => {
    expect(assertKnownSkills(['go', 'golang'], resolve)).toEqual(['go', 'go']);
  });

  it('rechaza con 422 UNKNOWN_SKILL si algo no resuelve', () => {
    try {
      assertKnownSkills(['go', 'cobol'], resolve);
      expect.unreachable();
    } catch (error) {
      expect(isDomainError(error) && error.code).toBe('UNKNOWN_SKILL');
      expect(isDomainError(error) && error.details?.slugs).toEqual(['cobol']);
    }
  });
});
