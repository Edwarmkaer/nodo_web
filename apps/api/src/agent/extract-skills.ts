import type { SkillRef } from '@nodo/contracts';
import type { SkillVocabulary } from '../domain/skill-vocabulary.js';
import type { LlmProvider } from './llm.js';

export type ExtractedSkill = SkillRef & { confidence: number };

/**
 * Síncrona, en el guardado del perfil (docs/05: ~1,5 s, evita un perfil sin
 * skills). También la usa `POST /v1/skills/extract` para la previsualización.
 *
 * **Validación post-LLM obligatoria** (docs/06): cualquier slug fuera de
 * `skills ∪ skill_aliases` se descarta en silencio. El invariante 6 se cumple
 * aquí, no confiando en el prompt — es exactamente el caso AC-01.
 */
export const extractSkills = async (
  llm: LlmProvider,
  vocabulary: SkillVocabulary,
  text: string,
): Promise<ExtractedSkill[]> => {
  const raw = await llm.extractSkills(text);
  const out: ExtractedSkill[] = [];

  for (const item of raw) {
    const canonical = vocabulary.resolve(item.slug);
    if (canonical === undefined) continue; // slug inventado: se descarta, no se persiste
    const skill = vocabulary.get(canonical);
    if (!skill) continue;
    out.push({ ...skill, confidence: item.confidence });
  }

  return out.slice(0, 8);
};
