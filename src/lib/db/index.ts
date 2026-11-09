import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { urlBaseDeDatos } from "../entorno";
import * as schema from "./schema";

// Reutiliza el cliente entre hot-reloads de dev (evita fugas de conexiones).
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.pgClient ??
  postgres(urlBaseDeDatos()!, {
    max: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
