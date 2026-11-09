/**
 * De dónde sale la tapa de un objeto. La app no guarda imágenes: guarda la fuente y la
 * referencia (`cover_source` + `cover_ref`) y arma la URL al mostrarla. Sin fuente conocida, la
 * tarjeta muestra la tapa genérica del tipo.
 */

/** El path que devuelve TMDB (`/kqjL17yufvn9OVLyXYpvtyrFfak.jpg`). Nada de URLs completas. */
const TMDB_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export const COVER_SOURCES = ["tmdb"] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];

export function isValidCover(source: string | null | undefined, ref: string | null | undefined): boolean {
  if (!source || !ref) return false;
  if (source === "tmdb") return TMDB_PATH.test(ref);
  return false;
}

export type CoverSize = "sm" | "md" | "lg";

const TMDB_SIZES: Record<CoverSize, string> = { sm: "w154", md: "w342", lg: "w780" };

export function coverUrl(source: string | null | undefined, ref: string | null | undefined, size: CoverSize = "md"): string | null {
  if (!isValidCover(source, ref)) return null;
  return `https://image.tmdb.org/t/p/${TMDB_SIZES[size]}${ref}`;
}
