import { z } from 'zod';
import { EpochMs } from './primitives.js';

export const NodeKind = z.enum(['person', 'idea', 'team', 'skill', 'agent']);
export type NodeKind = z.infer<typeof NodeKind>;

export const EdgeKind = z.enum([
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
export type EdgeKind = z.infer<typeof EdgeKind>;

const Meta = z.record(z.string(), z.unknown());

export const GraphNode = z.object({
  id: z.string().min(1),
  kind: NodeKind,
  label: z.string().min(1),
  status: z.string().optional(),
  meta: Meta.optional(),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  id: z.string().min(1),
  kind: EdgeKind,
  from: z.string().min(1),
  to: z.string().min(1),
  weight: z.number().optional(),
  /** `true` en las aristas `suggested`: el cliente las dibuja punteadas. */
  transient: z.boolean().optional(),
  expiresAt: EpochMs.optional(),
  meta: Meta.optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

/**
 * Parche del grafo. El cliente lo aplica sin ramificar por `type` del sobre.
 *
 * Semántica del upsert: siempre por `id`. Reaplicar el mismo parche es
 * idempotente, que es lo que hace segura la entrega *at-least-once* de Portal
 * y la reconexión por snapshot (docs/03).
 */
export const GraphPatch = z.object({
  nodes: z.array(GraphNode).optional(),
  edges: z.array(GraphEdge).optional(),
  removeNodes: z.array(z.string().min(1)).optional(),
  removeEdges: z.array(z.string().min(1)).optional(),
});
export type GraphPatch = z.infer<typeof GraphPatch>;

/**
 * Identificador determinista de arista (docs/04).
 *
 * El mismo hecho del dominio produce siempre el mismo id, así que borrar y
 * recrear una arista no deja duplicados en el grafo de un cliente que se
 * perdiera el `removeEdges` correspondiente.
 *
 * Las aristas `suggested` son la excepción: usan el id de la sugerencia, para
 * que `match.expired` pueda retirarlas con el `suggestionId` de su payload.
 */
export const edgeId = (kind: Exclude<EdgeKind, 'suggested'>, from: string, to: string): string =>
  `${kind}:${from}:${to}`;
