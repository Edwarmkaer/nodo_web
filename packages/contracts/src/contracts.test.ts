import { describe, expect, it } from 'vitest';
import {
  AGENT_ID,
  ApplicationCreated,
  edgeId,
  MAIN_CHANNEL,
  MainEvent,
  MatchSuggested,
  PersonDTO,
  SuggestionDTO,
  TeamDTO,
  TeamEvent,
  teamChannel,
  TeamNeedChanged,
} from './index.js';

const person = {
  id: 'per_camilo',
  handle: 'camilo',
  displayName: 'Camilo',
  headline: 'Backend dev',
  bio: 'Trabajo con Angular, Go y PostgreSQL.',
  availability: 'full',
  language: 'es',
  status: 'looking',
  teamId: null,
  createdAt: 1754600000000,
};

const suggestion = {
  id: 'sug_01J8K',
  personId: 'per_camilo',
  personName: 'Camilo',
  teamId: 'tm_healthai',
  teamName: 'Health AI',
  score: 7,
  direction: 'team_needs_person',
  matchedSkills: [
    { slug: 'go', label: 'Go', category: 'backend', priority: 'required' },
    { slug: 'angular', label: 'Angular', category: 'frontend', priority: 'required' },
  ],
  rationale: 'Camilo domina Angular y Go, los dos perfiles que Health AI marcó como imprescindibles.',
  expiresAt: 1754607200000,
  createdAt: 1754600000000,
};

const application = {
  id: 'app_01J8K',
  person: { id: 'per_camilo', handle: 'camilo', displayName: 'Camilo' },
  teamId: 'tm_healthai',
  teamName: 'Health AI',
  leadId: 'per_laura',
  status: 'pending',
  message: null,
  createdAt: 1754600000000,
  resolvedAt: null,
};

describe('identificadores', () => {
  it('rechaza un id con el prefijo de otra entidad', () => {
    expect(PersonDTO.safeParse({ ...person, id: 'tm_healthai' }).success).toBe(false);
  });

  it('rechaza un teamId donde se espera un personId', () => {
    const result = SuggestionDTO.safeParse({ ...suggestion, personId: 'tm_healthai' });
    expect(result.success).toBe(false);
  });
});

describe('SuggestionDTO', () => {
  it('acepta el sobre estrella de docs/03', () => {
    expect(SuggestionDTO.parse(suggestion)).toMatchObject({ teamName: 'Health AI' });
  });

  it('exige personName y teamName, que el bridge notify no puede resolver', () => {
    const { personName, teamName, ...sinNombres } = suggestion;
    expect(SuggestionDTO.safeParse(sinNombres).success).toBe(false);
  });

  it('exige label y category en matchedSkills', () => {
    const pobre = { ...suggestion, matchedSkills: [{ slug: 'go', priority: 'required' }] };
    expect(SuggestionDTO.safeParse(pobre).success).toBe(false);
  });

  it('rechaza una sugerencia sin coincidencias, que no podría explicarse', () => {
    expect(SuggestionDTO.safeParse({ ...suggestion, matchedSkills: [] }).success).toBe(false);
  });
});

describe('TeamDTO', () => {
  const team = {
    id: 'tm_healthai',
    name: 'Health AI',
    pitch: 'Asistente de triaje para clínicas rurales',
    status: 'recruiting',
    lead: { id: 'per_laura', handle: 'laura', displayName: 'Laura' },
    members: [{ id: 'per_laura', handle: 'laura', displayName: 'Laura' }],
    needs: [{ slug: 'go', label: 'Go', category: 'backend', priority: 'required' }],
    ideaId: null,
    maxSize: 4,
    createdAt: 1754600000000,
  };

  it('acepta un equipo recién creado con solo su líder', () => {
    expect(TeamDTO.parse(team).members).toHaveLength(1);
  });

  it('no admite más integrantes que el máximo del dominio', () => {
    const lleno = {
      ...team,
      members: Array.from({ length: 5 }, (_, i) => ({
        id: `per_${i}`,
        handle: `p${i}`,
        displayName: `P${i}`,
      })),
    };
    expect(TeamDTO.safeParse(lleno).success).toBe(false);
  });
});

describe('sobres', () => {
  const base = {
    v: 1 as const,
    id: 'evt_01J8K',
    at: 1754600000000,
    actor: { kind: 'agent' as const, id: AGENT_ID, displayName: 'MatchMaker' as const },
    summary: {
      text: 'MatchMaker sugirió conectar a Camilo con Health AI',
      icon: '🔗',
      refs: [{ kind: 'person' as const, id: 'per_camilo', label: 'Camilo' }],
    },
  };

  it('un sobre de network-main exige su parche de grafo', () => {
    const sinParche = { ...base, type: 'match.suggested', payload: { suggestion } };
    expect(MatchSuggested.safeParse(sinParche).success).toBe(false);
  });

  it('acepta el sobre estrella completo', () => {
    const sobre = {
      ...base,
      type: 'match.suggested',
      payload: { suggestion },
      graph: {
        edges: [
          {
            id: suggestion.id,
            kind: 'suggested',
            from: 'per_camilo',
            to: 'tm_healthai',
            weight: 7,
            transient: true,
            expiresAt: suggestion.expiresAt,
          },
        ],
      },
    };
    expect(MainEvent.parse(sobre).type).toBe('match.suggested');
  });

  it('un sobre de canal privado rechaza el parche de grafo', () => {
    const conParche = {
      ...base,
      actor: { kind: 'person', id: 'per_camilo', handle: 'camilo', displayName: 'Camilo' },
      type: 'application.created',
      payload: { application },
      graph: { nodes: [] },
    };
    expect(ApplicationCreated.safeParse(conParche).success).toBe(false);
  });

  it('acepta un sobre de canal privado sin parche', () => {
    const sobre = {
      ...base,
      actor: { kind: 'person', id: 'per_camilo', handle: 'camilo', displayName: 'Camilo' },
      type: 'application.created',
      payload: { application },
    };
    expect(TeamEvent.parse(sobre).type).toBe('application.created');
  });

  it('rechaza un campo no declarado', () => {
    const sobre = {
      ...base,
      actor: { kind: 'person', id: 'per_laura', handle: 'laura', displayName: 'Laura' },
      type: 'team.need_changed',
      payload: { teamId: 'tm_healthai', needs: [] },
      graphPatch: {},
    };
    expect(TeamNeedChanged.safeParse(sobre).success).toBe(false);
  });
});

describe('canales e ids de arista', () => {
  it('nombra el canal de equipo como lo espera authz', () => {
    expect(teamChannel('tm_healthai')).toBe('team-tm_healthai');
    expect(MAIN_CHANNEL).toBe('network-main');
  });

  it('deriva el mismo id para el mismo hecho del dominio', () => {
    expect(edgeId('has_skill', 'per_camilo', 'go')).toBe(
      edgeId('has_skill', 'per_camilo', 'go'),
    );
    expect(edgeId('member_of', 'per_camilo', 'tm_healthai')).toBe(
      'member_of:per_camilo:tm_healthai',
    );
  });
});
