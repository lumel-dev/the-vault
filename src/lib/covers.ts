/**
 * De dónde sale la tapa de un objeto. La app no guarda imágenes: guarda la fuente y la
 * referencia (`cover_source` + `cover_ref`) y arma la URL al mostrarla. Sin fuente conocida, la
 * tarjeta muestra la tapa genérica del tipo.
 *
 * Las tres fuentes mandan `Access-Control-Allow-Origin: *`, que es lo que permite usar la tapa
 * como textura en la vista 3D. Nunca se acepta una URL completa: sólo la referencia de cada fuente.
 */

/** El path que devuelve TMDB (`/kqjL17yufvn9OVLyXYpvtyrFfak.jpg`). */
const TMDB_PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
/** El id numérico de tapa de Open Library (`cover_i`). */
const OPENLIBRARY_ID = /^\d{1,12}$/;
/** El MBID de un release group de MusicBrainz (la tapa la sirve Cover Art Archive). */
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const COVER_SOURCES = ["tmdb", "openlibrary", "coverartarchive"] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];

export function isValidCover(source: string | null | undefined, ref: string | null | undefined): boolean {
  if (!source || !ref) return false;
  if (source === "tmdb") return TMDB_PATH.test(ref);
  if (source === "openlibrary") return OPENLIBRARY_ID.test(ref);
  if (source === "coverartarchive") return MBID.test(ref);
  return false;
}

export type CoverSize = "sm" | "md" | "lg";

const TMDB_SIZES: Record<CoverSize, string> = { sm: "w154", md: "w342", lg: "w780" };
const OPENLIBRARY_SIZES: Record<CoverSize, string> = { sm: "S", md: "M", lg: "L" };
const CAA_SIZES: Record<CoverSize, string> = { sm: "250", md: "500", lg: "1200" };

export function coverUrl(source: string | null | undefined, ref: string | null | undefined, size: CoverSize = "md"): string | null {
  if (!isValidCover(source, ref)) return null;
  switch (source) {
    case "openlibrary":
      return `https://covers.openlibrary.org/b/id/${ref}-${OPENLIBRARY_SIZES[size]}.jpg`;
    case "coverartarchive":
      return `https://coverartarchive.org/release-group/${ref}/front-${CAA_SIZES[size]}`;
    default:
      return `https://image.tmdb.org/t/p/${TMDB_SIZES[size]}${ref}`;
  }
}
