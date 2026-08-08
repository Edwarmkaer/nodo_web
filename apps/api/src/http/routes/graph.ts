import type { GraphSnapshot } from '@nodo/contracts';
import { getGraphSnapshot, getMainWatermark } from '../../db/graph-repo.js';
import type { AppContext } from '../context.js';
import { createRouter } from '../types.js';

/**
 * `GET /v1/graph`. Público y sin autenticación (docs/05).
 *
 * El orden importa (ADR-009): la marca de agua se lee **antes** que el
 * grafo. El peor caso al revés sería un sobre publicado entre ambas lecturas
 * que el cliente descarta por `seq` y el snapshot tampoco trae.
 */
export const graphRoutes = (ctx: AppContext) => {
  const router = createRouter();

  router.get('/v1/graph', async (c) => {
    const seq = await getMainWatermark(ctx.db);
    const { nodes, edges } = await getGraphSnapshot(ctx.db);
    const body: GraphSnapshot = { nodes, edges, seq };
    return c.json(body);
  });

  return router;
};
