import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { people } from '../db/schema.js';
import { loadPersonDTO } from '../db/people-repo.js';
import { loadTeamDTO } from '../db/teams-repo.js';
import { personAcceptsSuggestions, teamAcceptsSuggestions } from '../domain/state.js';
import type { MatchmakerService } from './matchmaker.js';
import type { Scheduler } from './scheduler.js';

/**
 * Los cinco disparadores de docs/06, con debounce de 800 ms por entidad
 * (ADR-004). El estado se relee dentro de la tarea encolada, no en el momento
 * de programarla: cinco `PATCH` seguidos colapsan en una sola evaluación con
 * el estado más reciente.
 */
export const triggerTeamNeedsPerson = (
  db: Db,
  matchmaker: MatchmakerService,
  scheduler: Scheduler,
  teamId: string,
  trigger: string,
): void => {
  scheduler.schedule(teamId, async () => {
    const team = await loadTeamDTO(db, teamId);
    if (!team) return;
    // Defensa adicional al guardarraíl 6, ya aplicado en SQL: el equipo pudo
    // cambiar de estado entre la escritura y esta ejecución diferida.
    if (!teamAcceptsSuggestions(team.status)) return;

    const [lead] = await db.select({ language: people.language }).from(people).where(eq(people.id, team.lead.id));

    await matchmaker.evaluateTeamNeedsPerson({
      trigger,
      team: {
        id: team.id,
        name: team.name,
        pitch: team.pitch,
        needs: team.needs,
        language: lead?.language ?? 'es',
      },
    });
  });
};

export const triggerPersonSeeksTeam = (
  db: Db,
  matchmaker: MatchmakerService,
  scheduler: Scheduler,
  personId: string,
  trigger: string,
): void => {
  scheduler.schedule(personId, async () => {
    const person = await loadPersonDTO(db, personId);
    if (!person) return;
    // Defensa adicional al guardarraíl 5, ya aplicado en SQL.
    if (!personAcceptsSuggestions(person.status)) return;

    await matchmaker.evaluatePersonSeeksTeam({
      trigger,
      person: {
        id: person.id,
        name: person.displayName,
        headline: person.headline,
        language: person.language,
      },
    });
  });
};
