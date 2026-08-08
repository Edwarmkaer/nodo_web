import { RecoverSessionRequest, type RecoverSessionResponse } from '@nodo/contracts';
import { findPersonByRecoveryCode } from '../../db/people-repo.js';
import { people } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { errors } from '../../domain/errors.js';
import { sessionToken as newSessionToken } from '../../domain/ids.js';
import type { AppContext } from '../context.js';
import { createRouter } from '../types.js';

/**
 * Devuelve la identidad a quien perdió el `localStorage`. Sin autenticar por
 * naturaleza —la única credencial disponible es el propio código—, así que se
 * limita por IP y no por sesión (docs/05).
 */
export const sessionRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.post('/v1/session/recover', async (c) => {
    const parsed = RecoverSessionRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw errors.validation(parsed.error.issues);

    const person = await findPersonByRecoveryCode(ctx.db, parsed.data.recoveryCode);
    if (!person) throw errors.notFound('No encontramos ninguna identidad con ese código.');

    // El sessionToken anterior queda anulado: se sustituye, no se duplica.
    const token = newSessionToken();
    await ctx.db.update(people).set({ sessionToken: token }).where(eq(people.id, person.id));

    const body: RecoverSessionResponse = { personId: person.id, sessionToken: token };
    return c.json(body);
  });

  return router;
};
