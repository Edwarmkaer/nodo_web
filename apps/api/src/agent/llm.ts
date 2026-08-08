/**
 * Segunda costura de docs/07 y docs/10, junto a `PortalPublisher`.
 *
 * Toda llamada a un modelo pasa por esta interfaz (ADR-007). La salida
 * estructurada usa `response_format: json_object` + validación Zod
 * obligatoria en `prompts.ts`, no *tool use*: es lo que se comporta igual en
 * todos los proveedores compatibles con OpenAI.
 */
export type RawExtractedSkill = { slug: string; confidence: number };

export type RationaleInput = {
  personDisplayName: string;
  personHeadline: string | null;
  personSkills: string[];
  teamName: string;
  teamPitch: string | null;
  needs: Array<{ label: string; priority: 'required' | 'nice' }>;
  matchedSkillLabels: string[];
  sameLanguage: boolean;
  language: string;
};

export interface LlmProvider {
  extractSkills(text: string): Promise<RawExtractedSkill[]>;
  writeRationale(input: RationaleInput): Promise<string>;
}
