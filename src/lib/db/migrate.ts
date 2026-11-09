import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index";

/**
 * Aplica las migraciones de `drizzle/` que falten. Corre al arrancar el server en producción
 * (`src/instrumentation.ts`) y en los tests; en desarrollo, `pnpm db:migrate`.
 */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
