import type { NeedRef } from '@nodo/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventPublisher, type OutboxStore, type WatermarkStore } from '../portal/event-publisher.js';
import { FakePortalPublisher } from '../portal/fake-publisher.js';
import { FakeCandidateRepository } from './candidate-repository.js';
import { MatchmakerDebugLog } from './debug-log.js';
import { FailingLlm, FakeLlm, HallucinatingLlm } from './llm-fakes.js';
import { MatchmakerService } from './matchmaker.js';
import { FakeSuggestionRepository } from './suggestion-repository.js';

class NoopWatermarks implements WatermarkStore {
  async record(): Promise<void> {}
}
class NoopOutbox implements OutboxStore {
  async enqueue(): Promise<void> {}
}

const goRequired: NeedRef = { slug: 'go', label: 'Go', category: 'backend', priority: 'required' };

const config = { scoreThreshold: 3, ttlMinutes: 120, maxPerPerson: 3, maxPerTeam: 5 };

const setup = (llm = new FakeLlm([], 'Camilo domina Go, justo lo que Health AI necesita.')) => {
  const candidates = new FakeCandidateRepository();
  const suggestions = new FakeSuggestionRepository();
  const portal = new FakePortalPublisher();
  const publisher = new EventPublisher(portal, new NoopWatermarks(), new NoopOutbox());
  const debugLog = new MatchmakerDebugLog();
  const service = new MatchmakerService(candidates, suggestions, llm, publisher, debugLog, config);
  return { candidates, suggestions, portal, publisher, debugLog, service };
};

describe('AC-02 — el equipo encuentra a la persona', () => {
  it('publica match.suggested con Camilo y el rationale nombra go', async () => {
    const { candidates, portal, service } = setup();
    (candidates as any).teamCandidates = {
      tm_healthai: [{ id: 'per_camilo', label: 'Camilo', score: 3, matchedSkills: [goRequired] }],
    };

    await service.evaluateTeamNeedsPerson({
      trigger: 'team.updated',
      team: { id: 'tm_healthai', name: 'Health AI', pitch: null, needs: [goRequired], language: 'es' },
    });

    expect(portal.published).toHaveLength(2); // fase 1 (plantilla) + fase 2 (real)
    const last = portal.published.at(-1)!.envelope;
    expect(last.type).toBe('match.suggested');
    expect((last.payload as any).suggestion.rationale.toLowerCase()).toContain('go');
    expect((last.payload as any).suggestion.personId).toBe('per_camilo');
  });
});

describe('AC-03 — la persona encuentra al equipo', () => {
  it('publica match.suggested hacia Health AI en la dirección inversa', async () => {
    const { candidates, portal, service } = setup();
    (candidates as any).personCandidates = {
      per_camilo: [{ id: 'tm_healthai', label: 'Health AI', score: 3, matchedSkills: [goRequired] }],
    };

    await service.evaluatePersonSeeksTeam({
      trigger: 'person.upserted',
      person: { id: 'per_camilo', name: 'Camilo', headline: null, language: 'es' },
    });

    const last = portal.published.at(-1)!.envelope;
    expect((last.payload as any).suggestion.teamId).toBe('tm_healthai');
    expect((last.payload as any).suggestion.direction).toBe('person_seeks_team');
  });
});

describe('guardarraíl 1 — no repetir', () => {
  it('un segundo disparo sobre el mismo par no publica de nuevo', async () => {
    const { candidates, portal, service } = setup();
    (candidates as any).teamCandidates = {
      tm_healthai: [{ id: 'per_camilo', label: 'Camilo', score: 3, matchedSkills: [goRequired] }],
    };
    const trigger = {
      trigger: 'team.updated',
      team: { id: 'tm_healthai', name: 'Health AI', pitch: null, needs: [goRequired], language: 'es' },
    };

    await service.evaluateTeamNeedsPerson(trigger);
    const afterFirst = portal.published.length;
    await service.evaluateTeamNeedsPerson(trigger);

    expect(portal.published).toHaveLength(afterFirst);
  });
});

describe('guardarraíles 3 y 4 — topes con desplazamiento', () => {
  it('al superar el tope por persona, expira la sugerencia de menor score y publica match.expired', async () => {
    const { candidates, suggestions, portal, service } = setup();

    // Sugerencia previa, viva, con score bajo, para el mismo personId pero otro equipo.
    await suggestions.tryClaim({
      id: 'sug_old',
      personId: 'per_camilo',
      teamId: 'tm_old',
      score: 3,
      direction: 'team_needs_person',
      matchedSkills: [goRequired],
      rationale: 'plantilla vieja',
      expiresAt: new Date(Date.now() + 120 * 60_000),
    });

    (candidates as any).teamCandidates = {
      tm_new: [{ id: 'per_camilo', label: 'Camilo', score: 5, matchedSkills: [goRequired] }],
    };

    const oneCapConfig = { ...config, maxPerPerson: 1 };
    const publisher = new EventPublisher(portal, new NoopWatermarks(), new NoopOutbox());
    const service2 = new MatchmakerService(
      candidates,
      suggestions,
      new FakeLlm([], 'Camilo domina Go.'),
      publisher,
      new MatchmakerDebugLog(),
      oneCapConfig,
    );

    await service2.evaluateTeamNeedsPerson({
      trigger: 'team.updated',
      team: { id: 'tm_new', name: 'Nuevo Equipo', pitch: null, needs: [goRequired], language: 'es' },
    });

    expect(suggestions.rows.get('sug_old')?.status).toBe('expired');
    expect(await suggestions.countLive({ personId: 'per_camilo' })).toBe(1);
    expect(
      portal.published.some(
        (p) => p.envelope.type === 'match.expired' && (p.envelope.payload as any).suggestionId === 'sug_old',
      ),
    ).toBe(true);
  });
});

describe('fallback de plantilla', () => {
  it('si el LLM lanza, la sugerencia publicada conserva el rationale de plantilla', async () => {
    const { candidates, portal, service } = setup(new FailingLlm());
    (candidates as any).teamCandidates = {
      tm_healthai: [{ id: 'per_camilo', label: 'Camilo', score: 3, matchedSkills: [goRequired] }],
    };

    await service.evaluateTeamNeedsPerson({
      trigger: 'team.updated',
      team: { id: 'tm_healthai', name: 'Health AI', pitch: null, needs: [goRequired], language: 'es' },
    });

    expect(portal.published).toHaveLength(1); // solo fase 1: el LLM nunca respondió
    expect((portal.published[0]!.envelope.payload as any).suggestion.rationale).toContain(
      'justo lo que',
    );
  });

  it('un rationale que no nombra el skill coincidente se descarta y no se republica', async () => {
    const { candidates, portal, suggestions, service } = setup(new HallucinatingLlm());
    (candidates as any).teamCandidates = {
      tm_healthai: [{ id: 'per_camilo', label: 'Camilo', score: 3, matchedSkills: [goRequired] }],
    };

    await service.evaluateTeamNeedsPerson({
      trigger: 'team.updated',
      team: { id: 'tm_healthai', name: 'Health AI', pitch: null, needs: [goRequired], language: 'es' },
    });

    expect(portal.published).toHaveLength(1);
    const row = [...suggestions.rows.values()][0]!;
    expect(row.rationale).toContain('justo lo que');
  });
});
