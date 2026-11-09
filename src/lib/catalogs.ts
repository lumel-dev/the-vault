/**
 * Catálogos abiertos para lo que TMDB no tiene: libros (Open Library) y discos (MusicBrainz, con
 * las tapas de Cover Art Archive). Ninguno pide API key. Se consultan sólo desde el server, como
 * TMDB, para no depender de lo que acepte cada browser y para mandar un User-Agent propio.
 *
 * MusicBrainz pide un User-Agent que identifique la app y como mucho un pedido por segundo: la
 * búsqueda se hace al apretar "Buscar", no mientras se tipea, así que alcanza.
 */

const USER_AGENT = "TheVault/0.1 ( https://github.com/lumel-dev/the-vault )";

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`${url.hostname} respondió ${res.status}`);
  return (await res.json()) as T;
}

export interface CatalogResult {
  /** Lo que se guarda en `external_id`: "work:OL14860424W" o "release-group:<mbid>". */
  externalId: string;
  title: string;
  /** Autor o artista. */
  by: string | null;
  year: string | null;
  cover: { source: "openlibrary" | "coverartarchive"; ref: string } | null;
  /** Atributos listos para el objeto (los que el tipo no declara se descartan al guardar). */
  attributes: Record<string, string>;
}

/* ------------------------------------------------------------------ libros */

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  publisher?: string[];
}

/** El ISBN-13 si hay, si no el primero (Open Library mezcla ediciones de todo el mundo). */
function pickIsbn(isbns: string[] | undefined): string | null {
  if (!isbns?.length) return null;
  return isbns.find((i) => i.length === 13 && (i.startsWith("97884") || i.startsWith("97895"))) ?? isbns.find((i) => i.length === 13) ?? isbns[0];
}

export function mapBook(doc: OpenLibraryDoc): CatalogResult {
  const author = doc.author_name?.slice(0, 2).join(", ") ?? null;
  const year = doc.first_publish_year ? String(doc.first_publish_year) : null;
  const isbn = pickIsbn(doc.isbn);
  const attributes: Record<string, string> = {};
  if (author) attributes.author = author;
  if (year) attributes.year = year;
  if (isbn) attributes.isbn = isbn;
  if (doc.publisher?.[0]) attributes.publisher = doc.publisher[0];
  return {
    externalId: `work:${doc.key.replace(/^\/works\//, "")}`,
    title: doc.title,
    by: author,
    year,
    cover: doc.cover_i ? { source: "openlibrary", ref: String(doc.cover_i) } : null,
    attributes,
  };
}

export async function searchBooks(query: string): Promise<CatalogResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,isbn,publisher");
  url.searchParams.set("limit", "12");
  const data = await getJson<{ docs: OpenLibraryDoc[] }>(url);
  return data.docs.map(mapBook);
}

/* ------------------------------------------------------------------ discos */

interface ReleaseGroup {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "artist-credit"?: { name: string; joinphrase?: string }[];
  tags?: { name: string; count: number }[];
}

export function mapAlbum(rg: ReleaseGroup): CatalogResult {
  const artist = rg["artist-credit"]?.map((a) => a.name + (a.joinphrase ?? "")).join("").trim() || null;
  const year = /^\d{4}/.test(rg["first-release-date"] ?? "") ? rg["first-release-date"]!.slice(0, 4) : null;
  const genre = [...(rg.tags ?? [])].sort((a, b) => b.count - a.count)[0]?.name ?? null;
  const attributes: Record<string, string> = {};
  if (artist) attributes.artist = artist;
  if (year) attributes.year = year;
  if (genre) attributes.genre = genre.charAt(0).toUpperCase() + genre.slice(1);
  return {
    externalId: `release-group:${rg.id}`,
    title: rg.title,
    by: artist,
    year,
    // Cover Art Archive no dice de antemano si hay tapa: si no hay, la imagen falla y se ve la genérica.
    cover: { source: "coverartarchive", ref: rg.id },
    attributes,
  };
}

export async function searchAlbums(query: string): Promise<CatalogResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = new URL("https://musicbrainz.org/ws/2/release-group/");
  url.searchParams.set("query", q);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "12");
  const data = await getJson<{ "release-groups": ReleaseGroup[] }>(url);
  // Primero los álbumes; los simples y compilados después.
  const rank = (t?: string) => (t === "Album" ? 0 : t === "EP" ? 1 : 2);
  return [...data["release-groups"]].sort((a, b) => rank(a["primary-type"]) - rank(b["primary-type"])).map(mapAlbum);
}
