import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Traducción literal de docs/04.
 *
 * Los invariantes viven aquí como índices únicos parciales, no solo en la capa
 * de servicio: un invariante que solo existe en el código no es un invariante
 * (docs/02).
 */

// ─── Vocabulario canónico (semilla, no se escribe en runtime) ────────────────

export const skills = pgTable(
  'skills',
  {
    slug: text('slug').primaryKey(),
    label: text('label').notNull(),
    category: text('category').notNull(),
  },
  (t) => [
    check(
      'skills_category_check',
      sql`${t.category} in ('frontend','backend','mobile','data-ai','design','product','infra','other')`,
    ),
  ],
);

/** Alias para la extracción por LLM: 'golang' → 'go', 'react.js' → 'react'. */
export const skillAliases = pgTable('skill_aliases', {
  alias: text('alias').primaryKey(),
  slug: text('slug')
    .notNull()
    .references(() => skills.slug, { onDelete: 'cascade' }),
});

// ─── Grafo ──────────────────────────────────────────────────────────────────

export const nodeKind = pgEnum('node_kind', ['person', 'idea', 'team', 'skill', 'agent']);

export const edgeKind = pgEnum('edge_kind', [
  'has_skill',
  'needs',
  'member_of',
  'leads',
  'interested_in',
  'authored',
  'spawned',
  'applied_to',
  'suggested',
]);

export const nodes = pgTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    kind: nodeKind('kind').notNull(),
    label: text('label').notNull(),
    status: text('status'),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('nodes_kind_status_idx').on(t.kind, t.status)],
);

export const edges = pgTable(
  'edges',
  {
    id: text('id').primaryKey(),
    kind: edgeKind('kind').notNull(),
    fromId: text('from_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    weight: real('weight'),
    transient: boolean('transient').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('edges_kind_to_idx').on(t.kind, t.toId),
    index('edges_kind_from_idx').on(t.kind, t.fromId),

    // Invariante 1: una persona pertenece como máximo a un equipo.
    uniqueIndex('one_team_per_person')
      .on(t.fromId)
      .where(sql`kind = 'member_of'`),

    // Invariante 4: una sola solicitud activa por (persona, equipo).
    uniqueIndex('one_active_application')
      .on(t.fromId, t.toId)
      .where(sql`kind = 'applied_to' and meta->>'status' = 'pending'`),

    // No duplicar aristas idénticas.
    uniqueIndex('uniq_skill_edges')
      .on(t.kind, t.fromId, t.toId)
      .where(
        sql`kind in ('has_skill','needs','member_of','leads','interested_in')`,
      ),
  ],
);

// ─── Detalle por tipo ───────────────────────────────────────────────────────
// Orden obligatorio: people → ideas → teams.

export const people = pgTable(
  'people',
  {
    id: text('id')
      .primaryKey()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name').notNull(),
    headline: text('headline'),
    bioRaw: text('bio_raw'),
    availability: text('availability').notNull().default('full'),
    language: text('language').notNull().default('es'),
    sessionToken: text('session_token').notNull().unique(),
    recoveryCode: text('recovery_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('people_availability_check', sql`${t.availability} in ('full','partial','evenings')`),
  ],
);

export const ideas = pgTable('ideas', {
  id: text('id')
    .primaryKey()
    .references(() => nodes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  authorId: text('author_id')
    .notNull()
    .references(() => people.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable(
  'teams',
  {
    id: text('id')
      .primaryKey()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pitch: text('pitch'),
    leadId: text('lead_id')
      .notNull()
      .references(() => people.id),
    ideaId: text('idea_id').references(() => ideas.id),
    maxSize: integer('max_size').notNull().default(4),
    /** El estado `building`: el líder congeló el reclutamiento. */
    frozen: boolean('frozen').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('teams_max_size_check', sql`${t.maxSize} between 1 and 4`)],
);

export const suggestions = pgTable(
  'suggestions',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    direction: text('direction').notNull(),
    matchedSkills: jsonb('matched_skills').notNull(),
    rationale: text('rationale').notNull(),
    status: text('status').notNull().default('live'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Guardarraíl 1 de docs/06: una sola sugerencia por par, incluidas las
     * caducadas. Sin cláusula WHERE y sin borrar filas, así el par queda
     * bloqueado de forma permanente. Si las filas vencidas se eliminaran, el
     * mismo par volvería a sugerirse cada dos horas.
     */
    uniqueIndex('one_suggestion_per_pair').on(t.personId, t.teamId),
    index('suggestions_status_expires_idx').on(t.status, t.expiresAt),
    check(
      'suggestions_direction_check',
      sql`${t.direction} in ('team_needs_person','person_seeks_team')`,
    ),
    check('suggestions_status_check', sql`${t.status} in ('live','expired','consumed')`),
  ],
);

// ─── Infraestructura ────────────────────────────────────────────────────────

/** Idempotencia del camino de webhook (entrega at-least-once de Portal). */
export const processedEvents = pgTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Reintento de publicaciones fallidas a Portal (ADR-005). */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    channel: text('channel').notNull(),
    envelope: jsonb('envelope').notNull(),
    attempts: integer('attempts').notNull().default(0),
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('outbox_pending_idx')
      .on(t.published, t.createdAt)
      .where(sql`not published`),
  ],
);

/**
 * Marca de agua por canal para el `seq` de GET /v1/graph (ADR-009).
 * Se actualiza en cada publicación con éxito; `outbox` solo registra los
 * fallos y por eso no puede sostenerla.
 */
export const channelWatermarks = pgTable('channel_watermarks', {
  channel: text('channel').primaryKey(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
