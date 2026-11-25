/**
 * Lo que devuelve toda server action. `retry` marca una falla que no es del usuario (la base, la
 * red del server): la cola de cambios (`src/lib/offline/`) la reintenta en vez de descartarla.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; retry?: true };

/** Un error para mostrarle al usuario tal cual (ya viene en su idioma). Cualquier otro es inesperado. */
export class UserError extends Error {}
