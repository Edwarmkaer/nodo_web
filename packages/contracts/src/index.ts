/**
 * `@nodo/contracts` — el contrato compartido entre el backend y el frontend.
 *
 * Es la definición ejecutable de docs/03 (contrato Portal) y docs/05 (API
 * REST). Si un tipo no está aquí, no forma parte del contrato.
 *
 * Los esquemas Zod son la fuente única: el tipo se deriva con `z.infer` y se
 * exporta con el mismo nombre. El backend valida con el esquema en el borde;
 * el frontend usa el tipo.
 */
export * from './primitives.js';
export * from './graph.js';
export * from './dto.js';
export * from './envelope.js';
export * from './events.js';
export * from './rest.js';
