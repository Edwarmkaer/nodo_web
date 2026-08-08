import { allow, block, defineConfig } from '@portalsdk/config';
import type { ApplicationDTO, SuggestionDTO } from '@nodo/contracts';

/**
 * Owner: backend (docs/03). Se despliega con `portal deploy` ([08](../../docs/08-operations.md)).
 *
 * Dos diferencias con el boceto de docs/03, descubiertas al escribir esto
 * contra el paquete real `@portalsdk/config` (0.2.1) en vez de a mano:
 *
 * 1. `access: 'authz'` es **obligatorio y explícito** en ambos canales.
 *    Omitirlo hace que `anonymous: false` caiga al default `'membership'`,
 *    que bloquea a todo el mundo con `not_member` **antes** de que `authz`
 *    llegue a ejecutarse — el callback nunca decidiría nada.
 * 2. El canal no se identifica con `ctx.channelId` sino con `ctx.channel.id`
 *    (`ChannelRef` trae también `key` y `mode`).
 *
 * El resto —`claimMap`, la forma de `notify`, `publish: false` en todos los
 * canales— coincide con lo documentado.
 */
export default defineConfig({
  webhooks: {
    url: 'https://api.nodo.app/v1/portal/webhooks',
  },

  // El JWT lo emite nuestro backend (RS256). Portal lo verifica contra
  // nuestro JWKS (ADR-006). `claimMap` mapea por ruta con puntos.
  auth: {
    issuer: 'https://api.nodo.app',
    jwksUrl: 'https://api.nodo.app/.well-known/jwks.json',
    claimMap: {
      userId: 'sub', // único obligatorio
      username: 'name',
      handle: 'handle',
      teams: 'teams', // { [teamId]: 'member' | 'applicant' }
    },
  },

  channels: {
    'network-main': {
      anonymous: false,
      access: 'authz',

      // Los clientes leen y emiten señales efímeras. Nadie publica eventos
      // de dominio: eso es del backend con la sk_ (ADR-005).
      authz: (ctx) => {
        if (ctx.claims.anon) return block('Crea tu perfil para entrar.');
        return allow({ publish: false, sendDirect: false });
      },

      // Un mensaje dirigido se convierte en InboxItem. Sin publicación
      // extra (ADR-008). `personName`/`teamName` viajan en el propio
      // content porque este código corre sin acceso a la base de datos.
      notify: (ctx) => {
        if (ctx.message.type !== 'match.suggested') return null;
        const { suggestion } = ctx.message.content as { suggestion: SuggestionDTO };
        return {
          title: `Encaje con ${suggestion.teamName}`,
          data: suggestion,
          to: [suggestion.personId],
        };
      },
    },

    'team-*': {
      anonymous: false,
      access: 'authz',

      // Solo miembros y solicitantes con solicitud activa.
      authz: (ctx) => {
        if (ctx.claims.anon) return block('Crea tu perfil para entrar.');
        const teamId = ctx.channel.id.slice('team-'.length);
        const teamsClaim = ctx.claims.teams as Record<string, string> | undefined;
        const role = teamsClaim?.[teamId];
        if (!role) return block('No perteneces a este equipo.');
        return allow({ publish: false, isMember: role === 'member' });
      },

      notify: (ctx) => {
        if (ctx.message.type !== 'application.created' && ctx.message.type !== 'application.resolved') {
          return null;
        }
        const { application } = ctx.message.content as { application: ApplicationDTO };

        if (ctx.message.type === 'application.created') {
          return {
            title: `${application.person.displayName} quiere unirse a ${application.teamName}`,
            data: application,
            to: [application.leadId],
          };
        }

        return {
          title:
            application.status === 'accepted'
              ? `Te uniste a ${application.teamName}`
              : `Solicitud resuelta en ${application.teamName}`,
          data: application,
          to: [application.person.id],
        };
      },
    },
  },
});
