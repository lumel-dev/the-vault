/**
 * Base de test para los tests de integración: un Postgres local con las migraciones de
 * `drizzle/` aplicadas (las mismas que corren al arrancar en producción).
 *
 * **Nunca la base del `.env`.** `src/lib/db/index.ts` crea el cliente al importarse, así que acá
 * se fijan `DATABASE_URL` y `ENVIRONMENT=production` ANTES de importar nada, y se corta si
 * `TEST_DATABASE_URL` no es localhost: los tests vacían tablas.
 *
 * Las server actions se llaman de verdad. Lo único que se reemplaza es la sesión (`auth()`),
 * `revalidatePath` y `server-only`, con `mock.module` (flag `--experimental-test-module-mocks`).
 */
import { mock } from "node:test";
import { sql } from "drizzle-orm";

const URL_TEST = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55438/the_vault_test";
const host = new URL(URL_TEST).hostname;
if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
  throw new Error(`TEST_DATABASE_URL apunta a "${host}": los tests vacían tablas, sólo corren contra una base local.`);
}
process.env.DATABASE_URL = URL_TEST;
process.env.ENVIRONMENT = "production";
delete process.env.DATABASE_URL_DEV;

/** El usuario de la sesión simulada. `null` = sin sesión. */
let usuarioActual: string | null = null;
export function sesionComo(userId: string | null) {
  usuarioActual = userId;
}

mock.module("@/lib/auth/auth", {
  namedExports: {
    auth: async () => (usuarioActual ? { user: { id: usuarioActual } } : null),
    signIn: async () => {},
    signOut: async () => {},
  },
});
mock.module("next/cache", { namedExports: { revalidatePath: () => {}, revalidateTag: () => {} } });
mock.module("server-only", { namedExports: {} });
// Fuera de una request no hay headers: el idioma del navegador se simula con esta variable.
mock.module("next/headers", {
  namedExports: {
    headers: async () => new Headers({ "accept-language": process.env.TEST_ACCEPT_LANGUAGE ?? "es-AR" }),
    // next-auth lo importa; la sesión ya está simulada, así que no se usa.
    cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
    draftMode: async () => ({ isEnabled: false }),
  },
});

export const { db } = await import("@/lib/db");
const schema = await import("@/lib/db/schema");

async function disponible(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    if (process.env.CI) throw error;
    return false;
  }
}

export const hayBase = await disponible();

if (hayBase) {
  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();
}

export async function limpiar() {
  await db.execute(sql`truncate table items, shelves, users cascade`);
}

export async function crearUsuario(email: string): Promise<string> {
  const [u] = await db
    .insert(schema.users)
    .values({ email, name: email.split("@")[0], passwordHash: "x", passwordSalt: "x" })
    .returning({ id: schema.users.id });
  return u.id;
}

/** Para saltear un test cuando no hay Postgres local (en la CI siempre hay: ahí falla). */
export const sinBase = hayBase ? false : "No hay Postgres local en TEST_DATABASE_URL (ver tests/README.md)";
