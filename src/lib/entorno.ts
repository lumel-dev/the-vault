/**
 * En qué entorno corre la app y, con eso, contra qué base se conecta.
 *
 * `ENVIRONMENT=development` usa `DATABASE_URL_DEV`; `production` (o la
 * variable sin cargar) usa `DATABASE_URL`. Sin cargar es producción.
 * Es la misma convención que mywallet, erp-base y `ldt db`.
 *
 * **En desarrollo sin `DATABASE_URL_DEV` se falla, no se cae en producción.** Quien pidió la base
 * de desarrollo y termina escribiendo en la real sin enterarse es exactamente el accidente que
 * esta variable viene a evitar.
 *
 * Módulo sin dependencias ni `server-only`: lo importan `src/lib/db/index.ts`,
 * `drizzle.config.ts` y los tests, que corren fuera de Next.
 */

export type Entorno = "production" | "development";

export function entorno(): Entorno {
  const valor = process.env.ENVIRONMENT?.trim().toLowerCase();
  if (!valor || valor === "production") return "production";
  if (valor === "development") return "development";
  throw new Error(`ENVIRONMENT="${process.env.ENVIRONMENT}" no es válido: tiene que ser "production" o "development".`);
}

/** La URL de la base según el entorno. */
export function urlBaseDeDatos(): string | undefined {
  if (entorno() === "development") {
    const url = process.env.DATABASE_URL_DEV;
    if (!url) throw new Error("ENVIRONMENT=development pero DATABASE_URL_DEV no está configurada.");
    return url;
  }
  return process.env.DATABASE_URL;
}
