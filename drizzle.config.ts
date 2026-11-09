import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

import { urlBaseDeDatos } from "./src/lib/entorno";

// drizzle-kit corre fuera de Next, que es quien carga el .env. En la CI y en producción no hay
// .env: las variables ya vienen del entorno, y las del entorno ganan.
if (existsSync(".env")) process.loadEnvFile(".env");

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: urlBaseDeDatos()!,
  },
} satisfies Config;
