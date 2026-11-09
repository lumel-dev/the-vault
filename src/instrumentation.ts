/**
 * Al arrancar el server de producción se aplican las migraciones pendientes: el deploy es un
 * contenedor en el VPS y no hay otro paso donde correrlas. Si fallan, el server no arranca, que
 * es mejor que servir con un esquema viejo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  const { runMigrations } = await import("./lib/db/migrate");
  await runMigrations();
}
