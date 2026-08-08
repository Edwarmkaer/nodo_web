import { createRouter } from '../types.js';

export const healthRoutes = createRouter();

healthRoutes.get('/health', (c) => c.json({ status: 'ok' }));
