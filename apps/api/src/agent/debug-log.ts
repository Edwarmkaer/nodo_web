import type { SuggestionDirection } from '@nodo/contracts';

/** Una tanda de evaluación, para `GET /v1/_debug/matchmaker` (docs/05, docs/08). */
export type MatchmakerBatchLog = {
  at: number;
  trigger: string;
  direction: SuggestionDirection;
  entityId: string;
  candidatesEvaluated: number;
  aboveThreshold: number;
  sqlLatencyMs: number;
  llmLatencyMs: number | null;
  fallbackUsed: boolean;
};

/**
 * Últimas 50 tandas. Es la vía para determinar por qué una sugerencia se
 * emitió o no, sin inferirlo de los logs (docs/06, docs/08).
 */
export class MatchmakerDebugLog {
  private readonly entries: MatchmakerBatchLog[] = [];
  private readonly capacity = 50;

  record(entry: MatchmakerBatchLog): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.capacity) this.entries.length = this.capacity;
  }

  recent(): MatchmakerBatchLog[] {
    return [...this.entries];
  }
}
