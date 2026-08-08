import { Hono } from 'hono';
import type { Vars } from './context.js';

/** Alias del tipo de app tipado con `Vars`, para no repetirlo en cada ruta. */
export type App = Hono<{ Variables: Vars }>;
export const createRouter = (): App => new Hono<{ Variables: Vars }>();
