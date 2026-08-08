import OpenAI from 'openai';
import type { LlmProvider, RationaleInput } from './llm.js';
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  buildRationaleSystemPrompt,
  buildRationaleUserPrompt,
  parseExtractionResponse,
  parseRationaleResponse,
} from './prompts.js';

/**
 * ADR-007: la interfaz es lo sustituible, no el proveedor. Este archivo es el
 * único que conoce que el proveedor es Groq — vía SDK `openai` con `baseURL`
 * configurable. Cambiar de proveedor son tres variables de entorno.
 */
export class GroqLlmProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    baseURL: string,
    private readonly model: string,
    private readonly vocabularyCatalog: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async extractSkills(text: string) {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildExtractionSystemPrompt(this.vocabularyCatalog) },
        { role: 'user', content: buildExtractionUserPrompt(text) },
      ],
    });
    const content = completion.choices[0]?.message.content ?? '{"skills":[]}';
    return parseExtractionResponse(content);
  }

  async writeRationale(input: RationaleInput): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildRationaleSystemPrompt() },
        { role: 'user', content: buildRationaleUserPrompt(input) },
      ],
    });
    const content = completion.choices[0]?.message.content ?? '{}';
    const rationale = parseRationaleResponse(content);
    if (rationale === undefined) throw new Error('El LLM no devolvió un rationale válido.');
    return rationale;
  }
}

/** Envuelve cualquier `LlmProvider` con el timeout de docs/06 (`LLM_TIMEOUT_MS`). */
export const withTimeout = (provider: LlmProvider, timeoutMs: number): LlmProvider => ({
  extractSkills: (text) => race(provider.extractSkills(text), timeoutMs),
  writeRationale: (input) => race(provider.writeRationale(input), timeoutMs),
});

const race = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`El LLM no respondió en ${timeoutMs} ms.`)), timeoutMs);
    }),
  ]);
