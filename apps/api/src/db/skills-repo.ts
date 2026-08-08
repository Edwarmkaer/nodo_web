import { skillAliases, skills } from './schema.js';
import type { Db } from './client.js';
import { SkillVocabulary } from '../domain/skill-vocabulary.js';
import { toSkillRef } from '../domain/mappers.js';

/** Carga el vocabulario una vez al arrancar (ADR-002: no cambia en runtime). */
export const loadVocabulary = async (db: Db): Promise<SkillVocabulary> => {
  const skillRows = await db.select().from(skills);
  const aliasRows = await db.select().from(skillAliases);
  return new SkillVocabulary(skillRows.map(toSkillRef), aliasRows);
};
