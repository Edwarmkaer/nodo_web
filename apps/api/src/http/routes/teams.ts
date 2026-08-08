import {
  CreateTeamRequest,
  MAX_TEAM_SIZE,
  ReplaceNeedsRequest,
  TeamStatus,
  UpdateTeamRequest,
  type NeedRef,
  type TeamResponse,
  type TeamsResponse,
} from '@nodo/contracts';
import { triggerTeamNeedsPerson } from '../../agent/triggers.js';
import {
  createTeam,
  deriveAndPersistTeamStatus,
  findTeamRow,
  loadTeamDTO,
  listTeams,
  replaceNeeds,
  updateTeam,
} from '../../db/teams-repo.js';
import { errors } from '../../domain/errors.js';
import { teamNeedChanged, teamUpdated, teamCreated, personActor } from '../../domain/envelopes.js';
import { teamId as newTeamId } from '../../domain/ids.js';
import { assertKnownSkills, assertPersonNotInTeam } from '../../domain/invariants.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

const resolveNeeds = (
  ctx: AppContext,
  needs: Array<{ slug: string; priority: 'required' | 'nice' }>,
): NeedRef[] => {
  const slugs = needs.map((n) => n.slug);
  const resolved = assertKnownSkills(slugs, ctx.vocabulary.resolve);
  return resolved.map((slug, i) => ({ ...ctx.vocabulary.get(slug)!, priority: needs[i]!.priority }));
};

export const teamsRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.post('/v1/teams', requireAuth(ctx), async (c) => {
    const auth = c.get('auth');
    assertPersonNotInTeam(auth.teamId);

    const parsed = CreateTeamRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);
    const input = parsed.data;

    const needs = resolveNeeds(ctx, input.needs);
    const id = newTeamId();

    await createTeam(ctx.db, {
      id,
      name: input.name,
      pitch: input.pitch ?? null,
      leadId: auth.personId,
      ideaId: input.ideaId ?? null,
      maxSize: input.maxSize ?? MAX_TEAM_SIZE,
      needs,
    });

    const team = (await loadTeamDTO(ctx.db, id))!;
    await ctx.publisher.publishMain(teamCreated(team));
    triggerTeamNeedsPerson(ctx.db, ctx.matchmaker, ctx.scheduler, id, 'team.created');

    const body: TeamResponse = { team };
    return c.json(body, 201);
  });

  router.patch('/v1/teams/:id', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');
    const row = await findTeamRow(ctx.db, id);
    if (!row) throw errors.notFound('No encontramos ese equipo.');
    if (row.leadId !== auth.personId) throw errors.forbidden('Solo el líder puede editar el equipo.');

    const parsed = UpdateTeamRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);
    const input = parsed.data;

    await updateTeam(ctx.db, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.pitch !== undefined && { pitch: input.pitch ?? null }),
      ...(input.frozen !== undefined && { frozen: input.frozen }),
    });
    await deriveAndPersistTeamStatus(ctx.db, id, input.frozen ?? row.frozen);

    const team = (await loadTeamDTO(ctx.db, id))!;
    await ctx.publisher.publishMain(teamUpdated(team, personActor({ id: auth.personId, handle: auth.handle, displayName: auth.displayName })));

    const body: TeamResponse = { team };
    return c.json(body);
  });

  /** El disparador principal (AC-02): reemplaza el conjunto completo de needs. */
  router.put('/v1/teams/:id/needs', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');
    const row = await findTeamRow(ctx.db, id);
    if (!row) throw errors.notFound('No encontramos ese equipo.');
    if (row.leadId !== auth.personId) throw errors.forbidden('Solo el líder puede editar las necesidades.');

    const parsed = ReplaceNeedsRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const needs = resolveNeeds(ctx, parsed.data.needs);
    const removedSlugs = await replaceNeeds(ctx.db, id, needs);

    const team = (await loadTeamDTO(ctx.db, id))!;
    const actor = personActor({ id: auth.personId, handle: auth.handle, displayName: auth.displayName });
    await ctx.publisher.publishMain(teamUpdated(team, actor, removedSlugs));
    await ctx.publisher.publishTeam(id, teamNeedChanged(team, actor));

    triggerTeamNeedsPerson(ctx.db, ctx.matchmaker, ctx.scheduler, id, 'team.updated');

    const body: TeamResponse = { team };
    return c.json(body);
  });

  router.get('/v1/teams/:id', async (c) => {
    const team = await loadTeamDTO(ctx.db, c.req.param('id'));
    if (!team) throw errors.notFound('No encontramos ese equipo.');
    const body: TeamResponse = { team };
    return c.json(body);
  });

  router.get('/v1/teams', async (c) => {
    const statusParam = c.req.query('status');
    const status = statusParam ? TeamStatus.parse(statusParam) : undefined;
    const teams = await listTeams(ctx.db, status);
    const body: TeamsResponse = { teams };
    return c.json(body);
  });

  return router;
};
