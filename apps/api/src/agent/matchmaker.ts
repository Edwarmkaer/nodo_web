import type { NeedRef } from '@nodo/contracts';
import { matchExpired, matchSuggested } from '../domain/envelopes.js';
import { suggestionId } from '../domain/ids.js';
import { toSuggestionDTO } from '../domain/mappers.js';
import type { EventPublisher } from '../portal/event-publisher.js';
import type { Candidate, CandidateRepository } from './candidate-repository.js';
import type { MatchmakerBatchLog } from './debug-log.js';
import type { MatchmakerDebugLog } from './debug-log.js';
import type { LlmProvider } from './llm.js';
import {
  rationaleNamesAMatch,
  templateRationale,
} from './prompts.js';
import type { SuggestionRepository } from './suggestion-repository.js';

export type MatchmakerConfig = {
  scoreThreshold: number;
  ttlMinutes: number;
  maxPerPerson: number;
  maxPerTeam: number;
};

export type TeamTrigger = {
  trigger: string;
  team: { id: string; name: string; pitch: string | null; needs: NeedRef[]; language: string };
};

export type PersonTrigger = {
  trigger: string;
  person: { id: string; name: string; headline: string | null; language: string };
};

/**
 * Orquesta el caso de uso principal de docs/06: **el LLM no decide a quién
 * sugerir, redacta por qué.** El candidato y el score salen de
 * `CandidateRepository` (SQL determinista); esta clase solo aplica los
 * guardarraíles y publica en dos fases.
 */
export class MatchmakerService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly suggestions: SuggestionRepository,
    private readonly llm: LlmProvider,
    private readonly publisher: EventPublisher,
    private readonly debugLog: MatchmakerDebugLog,
    private readonly config: MatchmakerConfig,
  ) {}

  async evaluateTeamNeedsPerson({ trigger, team }: TeamTrigger): Promise<void> {
    const sqlStart = Date.now();
    const candidates = await this.candidates.forTeam(
      team.id,
      team.language,
      this.config.scoreThreshold,
    );
    const sqlLatencyMs = Date.now() - sqlStart;

    let llmLatencyMs: number | null = null;
    let fallbackUsed = false;

    for (const candidate of candidates) {
      const result = await this.settle({
        direction: 'team_needs_person',
        personId: candidate.id,
        personName: candidate.label,
        personHeadline: null,
        personLanguage: null,
        teamId: team.id,
        teamName: team.name,
        teamPitch: team.pitch,
        needs: team.needs,
        candidate,
        language: team.language,
      });
      if (result.llmLatencyMs !== null) llmLatencyMs = result.llmLatencyMs;
      fallbackUsed = fallbackUsed || result.fallbackUsed;
    }

    this.log({
      trigger,
      direction: 'team_needs_person',
      entityId: team.id,
      candidatesEvaluated: candidates.length,
      sqlLatencyMs,
      llmLatencyMs,
      fallbackUsed,
    });
  }

  async evaluatePersonSeeksTeam({ trigger, person }: PersonTrigger): Promise<void> {
    const sqlStart = Date.now();
    const candidates = await this.candidates.forPerson(person.id, this.config.scoreThreshold);
    const sqlLatencyMs = Date.now() - sqlStart;

    let llmLatencyMs: number | null = null;
    let fallbackUsed = false;

    for (const candidate of candidates) {
      const result = await this.settle({
        direction: 'person_seeks_team',
        personId: person.id,
        personName: person.name,
        personHeadline: person.headline,
        personLanguage: person.language,
        teamId: candidate.id,
        teamName: candidate.label,
        teamPitch: null,
        needs: candidate.matchedSkills,
        candidate,
        language: person.language,
      });
      if (result.llmLatencyMs !== null) llmLatencyMs = result.llmLatencyMs;
      fallbackUsed = fallbackUsed || result.fallbackUsed;
    }

    this.log({
      trigger,
      direction: 'person_seeks_team',
      entityId: person.id,
      candidatesEvaluated: candidates.length,
      sqlLatencyMs,
      llmLatencyMs,
      fallbackUsed,
    });
  }

  private async settle(input: {
    direction: 'team_needs_person' | 'person_seeks_team';
    personId: string;
    personName: string;
    personHeadline: string | null;
    personLanguage: string | null;
    teamId: string;
    teamName: string;
    teamPitch: string | null;
    needs: NeedRef[];
    candidate: Candidate;
    language: string;
  }): Promise<{ llmLatencyMs: number | null; fallbackUsed: boolean }> {
    const matchedSkillLabels = input.candidate.matchedSkills.map((s) => s.label);
    const rationale = templateRationale(input.personName, input.teamName, matchedSkillLabels);
    const expiresAt = new Date(Date.now() + this.config.ttlMinutes * 60_000);
    const id = suggestionId();

    // Guardarraíl 1: par ya quemado. El caso normal, no un error.
    const claimed = await this.suggestions.tryClaim({
      id,
      personId: input.personId,
      teamId: input.teamId,
      score: input.candidate.score,
      direction: input.direction,
      matchedSkills: input.candidate.matchedSkills,
      rationale,
      expiresAt,
    });
    if (!claimed) return { llmLatencyMs: null, fallbackUsed: false };

    // Guardarraíles 3 y 4: topes por persona y por equipo, con desplazamiento.
    await this.enforceCap({ personId: input.personId }, this.config.maxPerPerson);
    await this.enforceCap({ teamId: input.teamId }, this.config.maxPerTeam);

    const dto = toSuggestionDTO({
      id,
      personId: input.personId,
      personName: input.personName,
      teamId: input.teamId,
      teamName: input.teamName,
      score: input.candidate.score,
      direction: input.direction,
      matchedSkills: input.candidate.matchedSkills,
      rationale,
      expiresAt,
      createdAt: new Date(),
    });

    // Fase 1: el grafo se mueve YA, con el rationale de plantilla.
    await this.publisher.publishMain(matchSuggested(dto));

    let llmLatencyMs: number | null = null;
    let fallbackUsed = false;
    try {
      const t0 = Date.now();
      const real = await this.llm.writeRationale({
        personDisplayName: input.personName,
        personHeadline: input.personHeadline,
        personSkills: matchedSkillLabels,
        teamName: input.teamName,
        teamPitch: input.teamPitch,
        needs: input.needs.map((n) => ({ label: n.label, priority: n.priority })),
        matchedSkillLabels,
        sameLanguage: input.personLanguage === null ? true : input.personLanguage === input.language,
        language: input.language,
      });
      llmLatencyMs = Date.now() - t0;

      if (rationaleNamesAMatch(real, matchedSkillLabels)) {
        await this.suggestions.updateRationale(id, real);
        // Fase 2: mismo id de arista → el cliente ve el texto enriquecerse en sitio.
        await this.publisher.publishMain(matchSuggested({ ...dto, rationale: real }));
      } else {
        fallbackUsed = true;
      }
    } catch {
      fallbackUsed = true;
    }

    return { llmLatencyMs, fallbackUsed };
  }

  private async enforceCap(
    filter: { personId: string } | { teamId: string },
    max: number,
  ): Promise<void> {
    const count = await this.suggestions.countLive(filter);
    if (count <= max) return;

    const lowest = await this.suggestions.lowestLive(filter);
    if (!lowest) return;

    await this.suggestions.expire(lowest.id);
    await this.publisher.publishMain(matchExpired(lowest.id));
  }

  private log(input: Omit<MatchmakerBatchLog, 'at' | 'aboveThreshold'>): void {
    this.debugLog.record({
      ...input,
      at: Date.now(),
      // El umbral ya se aplicó en SQL: todo lo que llegó aquí lo superó.
      aboveThreshold: input.candidatesEvaluated,
    });
  }
}
