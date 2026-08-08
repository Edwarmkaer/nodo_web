import { describe, expect, it } from 'vitest';
import { assertApplicationTransition, deriveTeamStatus } from './state.js';

describe('deriveTeamStatus — cascada de precedencia', () => {
  it('un equipo recién creado con solo su líder es recruiting', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 1, maxSize: 4 })).toBe('recruiting');
  });

  it('recruiting no exige needs sin cubrir: es el caso por defecto', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 2, maxSize: 4 })).toBe('recruiting');
  });

  it('almost_full con maxSize - 1 integrantes', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 3, maxSize: 4 })).toBe('almost_full');
  });

  it('complete al llegar a maxSize', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 4, maxSize: 4 })).toBe('complete');
  });

  it('building prevalece sobre el conteo, aunque haya hueco', () => {
    expect(deriveTeamStatus({ frozen: true, memberCount: 1, maxSize: 4 })).toBe('building');
  });

  it('maxSize=2 nace almost_full con solo el líder', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 1, maxSize: 2 })).toBe('almost_full');
  });

  it('maxSize=1 nace complete: nunca recibe sugerencias', () => {
    expect(deriveTeamStatus({ frozen: false, memberCount: 1, maxSize: 1 })).toBe('complete');
  });
});

describe('Application.status', () => {
  it('acepta pending → accepted', () => {
    expect(() => assertApplicationTransition('pending', 'accepted')).not.toThrow();
  });

  it('rechaza una transición desde un estado terminal', () => {
    expect(() => assertApplicationTransition('accepted', 'rejected')).toThrow();
  });

  it('rechaza aceptar dos veces', () => {
    expect(() => assertApplicationTransition('rejected', 'accepted')).toThrow();
  });
});
