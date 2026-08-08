import type { PortalTokenResponse } from '@nodo/contracts';
import { listPendingApplicationTeamIds } from '../../db/applications-repo.js';
import { getPersonTeamId } from '../../db/people-repo.js';
import { processedEvents } from '../../db/schema.js';
import { isFromMatchmaker, verifyHmac } from '../../portal/webhook.js';
import type { AppContext } from '../context.js';
import { requireAuth } from '../middleware/auth.js';
import { createRouter } from '../types.js';

export const portalRoutes = (ctx: AppContext) => {
  const router = createRouter();

  /** Emite el JWT de Portal. Vida: 15 min. Incluye el claim `teams` (docs/05). */
  router.post('/v1/portal/token', requireAuth(ctx), async (c) => {
    const auth = c.get('auth');
    const memberTeamId = await getPersonTeamId(ctx.db, auth.personId);
    const applicantTeamIds = await listPendingApplicationTeamIds(ctx.db, auth.personId);

    const teams: Record<string, 'member' | 'applicant'> = {};
    if (memberTeamId) teams[memberTeamId] = 'member';
    for (const teamId of applicantTeamIds) teams[teamId] ??= 'applicant';

    const { token, expiresIn } = await ctx.jwtIssuer.issue({
      personId: auth.personId,
      handle: auth.handle,
      name: auth.displayName,
      teams,
    });

    const body: PortalTokenResponse = { token, expiresIn };
    return c.json(body);
  });

  /** Público y sin auth: solo la clave pública de firma (ADR-006). */
  router.get('/.well-known/jwks.json', (c) => c.json(ctx.jwks));

  /**
   * Camino secundario (ADR-004): el matchmaker se dispara en proceso. Este
   * receptor es la red de seguridad ante eventos publicados fuera del flujo
   * REST. Orden obligatorio, nunca al revés (docs/05).
   */
  router.post('/v1/portal/webhooks', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('portal-signature');

    if (!verifyHmac(rawBody, signature, ctx.env.PORTAL_WEBHOOK_SECRET)) {
      return c.json({ error: 'INVALID_SIGNATURE' }, 401);
    }

    const evt = JSON.parse(rawBody) as { id?: string; data?: { senderId?: string } };

    // Guardarraíl anti-bucle. Sin esto el agente se retroalimenta.
    if (isFromMatchmaker(evt)) return c.body(null, 204);

    if (!evt.id) return c.body(null, 204);
    const fresh = await markProcessedIfNew(ctx, evt.id);
    if (!fresh) return c.body(null, 204);

    // El disparo en proceso ya cubre el caso de uso principal; este receptor
    // no reprocesa el dominio, solo garantiza no reintentar un evento repetido.
    return c.body(null, 204);
  });

  return router;
};

const markProcessedIfNew = async (ctx: AppContext, eventId: string): Promise<boolean> => {
  const result = await ctx.db
    .insert(processedEvents)
    .values({ eventId })
    .onConflictDoNothing()
    .returning();
  return result.length > 0;
};
