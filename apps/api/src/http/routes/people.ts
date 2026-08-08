import {
  CreatePersonRequest,
  UpdatePersonRequest,
  UpdatePersonStatusRequest,
  type CreatePersonResponse,
  type PersonResponse,
  type SkillRef,
} from '@nodo/contracts';
import { extractSkills } from '../../agent/extract-skills.js';
import { triggerPersonSeeksTeam } from '../../agent/triggers.js';
import {
  createPerson,
  findPersonById,
  getPersonSkills,
  handleExists,
  loadPersonDTO,
  setPersonStatus,
  updatePerson,
} from '../../db/people-repo.js';
import { errors } from '../../domain/errors.js';
import { personStatusChanged, personUpserted } from '../../domain/envelopes.js';
import { personId as newPersonId, recoveryCode, sessionToken } from '../../domain/ids.js';
import { assertKnownSkills } from '../../domain/invariants.js';
import { assertPersonStatusTransition } from '../../domain/state.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

const resolveRequestedSkills = (ctx: AppContext, slugs: string[]): SkillRef[] => {
  const resolved = assertKnownSkills(slugs, ctx.vocabulary.resolve);
  return resolved.map((slug) => ctx.vocabulary.get(slug)!);
};

export const peopleRoutes = (ctx: AppContext) => {
  const router = createRouter();

  /**
   * Única ruta de escritura sin autenticar: acuña identidad y perfil en el
   * mismo acto (ADR-006, docs/05).
   */
  router.post('/v1/people', async (c) => {
    const parsed = CreatePersonRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);
    const input = parsed.data;

    if (await handleExists(ctx.db, input.handle)) throw errors.handleTaken(input.handle);

    let skills: SkillRef[];
    if (input.skills && input.skills.length > 0) {
      skills = resolveRequestedSkills(ctx, input.skills);
    } else if (input.bioRaw) {
      // Síncrono: ~1,5 s, evita que la persona vea un perfil sin skills.
      const extracted = await extractSkills(ctx.llm, ctx.vocabulary, input.bioRaw);
      skills = extracted.map(({ confidence: _confidence, ...skill }) => skill);
    } else {
      skills = [];
    }

    const id = newPersonId();
    const token = sessionToken();
    const recovery = recoveryCode();

    await createPerson(ctx.db, {
      id,
      handle: input.handle,
      displayName: input.displayName,
      headline: input.headline ?? null,
      bioRaw: input.bioRaw ?? null,
      availability: input.availability ?? 'full',
      language: input.language ?? 'es',
      sessionToken: token,
      recoveryCode: recovery,
      skills,
    });

    const person = (await loadPersonDTO(ctx.db, id))!;
    await ctx.publisher.publishMain(personUpserted(person, skills));
    triggerPersonSeeksTeam(ctx.db, ctx.matchmaker, ctx.scheduler, id, 'person.upserted');

    const body: CreatePersonResponse = {
      person,
      skills,
      sessionToken: token,
      recoveryCode: recovery,
    };
    return c.json(body, 201);
  });

  router.patch('/v1/people/:id', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');
    if (auth.personId !== id) throw errors.forbidden('Solo puedes editar tu propio perfil.');

    const parsed = UpdatePersonRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);
    const input = parsed.data;

    let nextSkills: SkillRef[] | undefined;
    if (input.skills) {
      nextSkills = resolveRequestedSkills(ctx, input.skills);
    } else if (input.bioRaw) {
      const extracted = await extractSkills(ctx.llm, ctx.vocabulary, input.bioRaw);
      nextSkills = extracted.map(({ confidence: _confidence, ...skill }) => skill);
    }

    const { removed } = await updatePerson(
      ctx.db,
      id,
      {
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.headline !== undefined && { headline: input.headline ?? null }),
        ...(input.bioRaw !== undefined && { bioRaw: input.bioRaw ?? null }),
        ...(input.availability !== undefined && { availability: input.availability }),
        ...(input.language !== undefined && { language: input.language }),
      },
      nextSkills,
    );

    const person = (await loadPersonDTO(ctx.db, id))!;
    const currentSkills = await getPersonSkills(ctx.db, id);
    await ctx.publisher.publishMain(personUpserted(person, currentSkills, removed));

    if (nextSkills !== undefined) {
      triggerPersonSeeksTeam(ctx.db, ctx.matchmaker, ctx.scheduler, id, 'person.upserted');
    }

    const body: PersonResponse = { person, skills: currentSkills };
    return c.json(body);
  });

  router.put('/v1/people/:id/status', requireAuth(ctx), async (c) => {
    const id = c.req.param('id');
    const auth = c.get('auth');
    if (auth.personId !== id) throw errors.forbidden('Solo puedes cambiar tu propio estado.');

    const parsed = UpdatePersonStatusRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const current = await findPersonById(ctx.db, id);
    if (!current) throw errors.notFound('No encontramos ese perfil.');

    assertPersonStatusTransition(current.status, parsed.data.status);
    await setPersonStatus(ctx.db, id, parsed.data.status);

    const person = (await loadPersonDTO(ctx.db, id))!;
    await ctx.publisher.publishMain(personStatusChanged(person, current.status));

    if (parsed.data.status === 'looking') {
      triggerPersonSeeksTeam(ctx.db, ctx.matchmaker, ctx.scheduler, id, 'person.status_changed');
    }

    const body: PersonResponse = { person, skills: await getPersonSkills(ctx.db, id) };
    return c.json(body);
  });

  router.get('/v1/people/:id', async (c) => {
    const id = c.req.param('id');
    const person = await loadPersonDTO(ctx.db, id);
    if (!person) throw errors.notFound('No encontramos ese perfil.');
    const body: PersonResponse = { person, skills: await getPersonSkills(ctx.db, id) };
    return c.json(body);
  });

  return router;
};
