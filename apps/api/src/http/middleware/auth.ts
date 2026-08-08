import type { MiddlewareHandler } from 'hono';
import { errors } from '../../domain/errors.js';
import { findPersonBySessionToken, getPersonTeamId } from '../../db/people-repo.js';
import type { AppContext, AuthInfo, Vars } from '../context.js';

/**
 * `Authorization: Bearer <sessionToken>` — nunca el JWT de Portal, que solo
 * sirve para hablar con Portal, nunca con esta API (docs/05).
 */
export const requireAuth = (ctx: AppContext): MiddlewareHandler<{ Variables: Vars }> => {
  return async (c, next) => {
    const header = c.req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) throw errors.unauthenticated();

    const person = await findPersonBySessionToken(ctx.db, token);
    if (!person) throw errors.unauthenticated();

    const teamId = await getPersonTeamId(ctx.db, person.id);
    const auth: AuthInfo = {
      personId: person.id,
      handle: person.handle,
      displayName: person.displayName,
      status: person.status,
      teamId,
    };
    c.set('auth', auth);

    await next();
  };
};
