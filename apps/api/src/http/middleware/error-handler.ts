import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { isDomainError } from '../../domain/errors.js';

/** Forma única de docs/05: `{ error, message, details? }`. */
export const errorHandler: ErrorHandler = (err, c) => {
  if (isDomainError(err)) {
    return c.json(err.toApiError(), err.status as never);
  }

  if (err instanceof ZodError) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', details: { issues: err.issues } },
      422,
    );
  }

  console.error('[http] error no manejado', err);
  // Fuera del contrato deliberadamente: docs/09 no define un código para
  // fallos no anticipados, solo para las rutas de error conocidas.
  return c.json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor.' }, 500);
};
