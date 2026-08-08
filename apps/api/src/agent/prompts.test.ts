import { describe, expect, it } from 'vitest';
import {
  parseExtractionResponse,
  parseRationaleResponse,
  rationaleNamesAMatch,
  templateRationale,
} from './prompts.js';

describe('parseExtractionResponse', () => {
  it('parsea la forma esperada', () => {
    const raw = JSON.stringify({ skills: [{ slug: 'go', confidence: 1 }] });
    expect(parseExtractionResponse(raw)).toEqual([{ slug: 'go', confidence: 1 }]);
  });

  it('devuelve vacío ante una forma inesperada, sin lanzar', () => {
    expect(parseExtractionResponse(JSON.stringify({ oops: true }))).toEqual([]);
  });
});

describe('parseRationaleResponse', () => {
  it('extrae el rationale', () => {
    expect(parseRationaleResponse(JSON.stringify({ rationale: 'Texto.' }))).toBe('Texto.');
  });

  it('devuelve undefined si falta el campo', () => {
    expect(parseRationaleResponse(JSON.stringify({}))).toBeUndefined();
  });
});

describe('rationaleNamesAMatch — guardarraíl de docs/06', () => {
  it('acepta un rationale que nombra un skill coincidente', () => {
    expect(rationaleNamesAMatch('Camilo domina Go y Angular.', ['Go', 'Angular'])).toBe(true);
  });

  it('rechaza un rationale genérico', () => {
    expect(rationaleNamesAMatch('Parecen compatibles.', ['Go', 'Angular'])).toBe(false);
  });

  it('no distingue mayúsculas', () => {
    expect(rationaleNamesAMatch('sabe GO', ['Go'])).toBe(true);
  });
});

describe('templateRationale — fallback que nunca deja sin explicación', () => {
  it('nombra los dos primeros skills coincidentes', () => {
    expect(templateRationale('Camilo', 'Health AI', ['Go', 'Angular'])).toBe(
      'Camilo sabe Go y Angular, justo lo que Health AI está buscando.',
    );
  });

  it('funciona con un solo skill', () => {
    expect(templateRationale('Camilo', 'Health AI', ['Go'])).toBe(
      'Camilo sabe Go, justo lo que Health AI está buscando.',
    );
  });
});
