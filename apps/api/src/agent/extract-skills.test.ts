import { describe, expect, it } from 'vitest';
import { SkillVocabulary } from '../domain/skill-vocabulary.js';
import { extractSkills } from './extract-skills.js';
import { FakeLlm, HallucinatingLlm } from './llm-fakes.js';

const vocabulary = new SkillVocabulary(
  [
    { slug: 'angular', label: 'Angular', category: 'frontend' },
    { slug: 'go', label: 'Go', category: 'backend' },
    { slug: 'postgresql', label: 'PostgreSQL', category: 'backend' },
    { slug: 'frontend', label: 'Frontend', category: 'frontend' },
    { slug: 'backend', label: 'Backend', category: 'backend' },
  ],
  [{ alias: 'golang', slug: 'go' }],
);

describe('extractSkills — AC-01', () => {
  it('devuelve los skills esperados para "Angular, Go y PostgreSQL"', async () => {
    const llm = new FakeLlm([
      { slug: 'angular', confidence: 1.0 },
      { slug: 'go', confidence: 1.0 },
      { slug: 'postgresql', confidence: 1.0 },
      { slug: 'frontend', confidence: 0.6 },
      { slug: 'backend', confidence: 0.6 },
    ]);

    const result = await extractSkills(llm, vocabulary, 'Trabajo con Angular, Go y PostgreSQL');

    expect(result.map((s) => s.slug).sort()).toEqual(
      ['angular', 'backend', 'frontend', 'go', 'postgresql'].sort(),
    );
  });

  it('un slug inventado no se persiste (invariante 6)', async () => {
    const llm = new HallucinatingLlm();
    const result = await extractSkills(llm, vocabulary, 'Cobol avanzado y Go');

    expect(result.map((s) => s.slug)).toEqual(['go']);
    expect(result.some((s) => s.slug === 'cobol-avanzado')).toBe(false);
  });

  it('resuelve un alias al slug canónico', async () => {
    const llm = new FakeLlm([{ slug: 'golang', confidence: 1.0 }]);
    const result = await extractSkills(llm, vocabulary, 'Golang');
    expect(result).toEqual([{ slug: 'go', label: 'Go', category: 'backend', confidence: 1.0 }]);
  });
});
