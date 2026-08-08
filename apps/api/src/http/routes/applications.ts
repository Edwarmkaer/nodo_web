import {
  CreateApplicationRequest,
  ResolveApplicationRequest,
  type ApplicationResponse,
  type ApplicationsResponse,
} from '@nodo/contracts';
import { triggerTeamNeedsPerson } from '../../agent/triggers.js';
import {
  acceptApplication,
  createApplication,
  findApplicationById,
  findPendingApplication,
  listApplicationsForTeam,
  rejectApplication,
  withdrawApplication,
} from '../../db/applications-repo.js';
import { findTeamRow, deriveAndPersistTeamStatus, getPersonRef, loadTeamDTO } from '../../db/teams-repo.js';
import { setPersonStatus } from '../../db/people-repo.js';
import { errors } from '../../domain/errors.js';
import {
  applicationCreated,
  applicationResolved,
  matchExpired,
  personActor,
  teamMemberJoined,
} from '../../domain/envelopes.js';
import { applicationId as newApplicationId } from '../../domain/ids.js';
import { assertApplicationTransition } from '../../domain/state.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

export const applicationsRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.post('/v1/teams/:id/applications', requireAuth(ctx), async (c) => {
    const teamId = c.req.param('id');
    const auth = c.get('auth');

    const team = await findTeamRow(ctx.db, teamId);
    if (!team) throw errors.notFound('No encontramos ese equipo.');

    // Invariante 4, con mensaje de error legible antes de que lo aplique el
    // índice único parcial de docs/04.
    const existing = await findPendingApplication(ctx.db, auth.personId, teamId);
    if (existing) throw errors.duplicateApplication(existing);

    const parsed = CreateApplicationRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const id = newApplicationId();
    await createApplication(ctx.db, {
      id,
      personId: auth.personId,
      teamId,
      message: parsed.data.message ?? null,
    });

    const application = (await findApplicationById(ctx.db, id))!;
    await ctx.publisher.publishTeam(
      teamId,
      applicationCreated(application),
    );

    const body: ApplicationResponse = { application };
    return c.json(body, 201);
  });

  router.post('/v1/applications/:id/resolve', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');

    const application = await findApplicationById(ctx.db, id);
    if (!application) throw errors.notFound('No encontramos esa solicitud.');
    if (application.leadId !== auth.personId) throw errors.forbidden('Solo el líder puede resolver solicitudes.');

    const parsed = ResolveApplicationRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const nextStatus = parsed.data.action === 'accept' ? 'accepted' : 'rejected';
    assertApplicationTransition(application.status, nextStatus);

    if (parsed.data.action === 'accept') {
      const teamRow = await findTeamRow(ctx.db, application.teamId);
      if (!teamRow) throw errors.notFound('No encontramos ese equipo.');

      const currentMembers = (await loadTeamDTO(ctx.db, application.teamId))!.members.length;
      if (currentMembers >= teamRow.maxSize) throw errors.teamFull(teamRow.maxSize);

      // Invariante 5 completo, en una transacción.
      const { invalidatedSuggestionIds } = await acceptApplication(ctx.db, {
        id: application.id,
        personId: application.person.id,
        teamId: application.teamId,
      });
      await setPersonStatus(ctx.db, application.person.id, 'teamed');
      await deriveAndPersistTeamStatus(ctx.db, application.teamId, teamRow.frozen);

      const team = (await loadTeamDTO(ctx.db, application.teamId))!;
      const personRef = (await getPersonRef(ctx.db, application.person.id))!;

      await ctx.publisher.publishMain(teamMemberJoined(team, personRef, 'teamed'));

      const resolved = (await findApplicationById(ctx.db, application.id))!;
      await ctx.publisher.publishTeam(
        application.teamId,
        applicationResolved(resolved, personActor({ id: auth.personId, handle: auth.handle, displayName: auth.displayName })),
      );

      for (const suggestionId of invalidatedSuggestionIds) {
        await ctx.publisher.publishMain(matchExpired(suggestionId));
      }

      triggerTeamNeedsPerson(ctx.db, ctx.matchmaker, ctx.scheduler, application.teamId, 'team.member_joined');

      const body: ApplicationResponse = { application: resolved };
      return c.json(body);
    }

    await rejectApplication(ctx.db, application.id);
    const resolved = (await findApplicationById(ctx.db, application.id))!;
    await ctx.publisher.publishTeam(
      application.teamId,
      applicationResolved(resolved, personActor({ id: auth.personId, handle: auth.handle, displayName: auth.displayName })),
    );

    const body: ApplicationResponse = { application: resolved };
    return c.json(body);
  });

  router.post('/v1/applications/:id/withdraw', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');

    const application = await findApplicationById(ctx.db, id);
    if (!application) throw errors.notFound('No encontramos esa solicitud.');
    if (application.person.id !== auth.personId) throw errors.forbidden('Solo puedes retirar tu propia solicitud.');

    assertApplicationTransition(application.status, 'withdrawn');
    await withdrawApplication(ctx.db, id);

    const resolved = (await findApplicationById(ctx.db, id))!;
    await ctx.publisher.publishTeam(
      application.teamId,
      applicationResolved(resolved, personActor({ id: auth.personId, handle: auth.handle, displayName: auth.displayName })),
    );

    const body: ApplicationResponse = { application: resolved };
    return c.json(body);
  });

  router.get('/v1/teams/:id/applications', requireAuth(ctx), async (c) => {
    const teamId = c.req.param('id');
    const auth = c.get('auth');
    const team = await findTeamRow(ctx.db, teamId);
    if (!team) throw errors.notFound('No encontramos ese equipo.');
    if (team.leadId !== auth.personId) throw errors.forbidden('Solo el líder puede ver las solicitudes.');

    const applications = await listApplicationsForTeam(ctx.db, teamId);
    const body: ApplicationsResponse = { applications };
    return c.json(body);
  });

  return router;
};
