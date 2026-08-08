import type { LlmProvider, RationaleInput, RawExtractedSkill } from './llm.js';

/**
 * Los tres dobles de docs/10. `HallucinatingLlm` y `FailingLlm` importan más
 * que `FakeLlm`: cubren las rutas que en producción aparecen bajo fallo y que
 * nunca se ejercitan a mano.
 */

/** Camino feliz: respuesta fija y válida. */
export class FakeLlm implements LlmProvider {
  constructor(
    private readonly skills: RawExtractedSkill[] = [],
    private readonly rationale = 'Rationale de prueba.',
  ) {}

  async extractSkills(): Promise<RawExtractedSkill[]> {
    return this.skills;
  }

  async writeRationale(): Promise<string> {
    return this.rationale;
  }
}

/** Devuelve slugs fuera del vocabulario: verifica que la validación posterior los descarta. */
export class HallucinatingLlm implements LlmProvider {
  async extractSkills(): Promise<RawExtractedSkill[]> {
    return [
      { slug: 'cobol-avanzado', confidence: 1.0 },
      { slug: 'go', confidence: 1.0 },
    ];
  }

  async writeRationale(input: RationaleInput): Promise<string> {
    return `${input.personDisplayName} es LA MEJOR PERSONA DEL MUNDO, van a ganar seguro.`;
  }
}

/** Lanza excepción o excede el timeout: verifica que entra el fallback de plantilla. */
export class FailingLlm implements LlmProvider {
  constructor(private readonly mode: 'throw' | 'hang' = 'throw') {}

  async extractSkills(): Promise<RawExtractedSkill[]> {
    if (this.mode === 'hang') await new Promise(() => {});
    throw new Error('El proveedor de LLM no está disponible.');
  }

  async writeRationale(): Promise<string> {
    if (this.mode === 'hang') await new Promise(() => {});
    throw new Error('El proveedor de LLM no está disponible.');
  }
}
