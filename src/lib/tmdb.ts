/**
 * Cliente mínimo de TMDB (themoviedb.org): buscar películas y series, las temporadas de una serie,
 * la dirección de una película y los datos de un título en cada idioma de la app. Se usa sólo del
 * lado del server: el token no llega al browser.
 *
 * Cada pedido va en un idioma (`es-MX` o `en-US`, ver `TMDB_LANGUAGE` en `src/lib/i18n`): la
 * búsqueda en el del usuario, y al guardar algo se piden los dos para poder mostrarlo en cualquiera.
 *
 * Sin `TMDB_API_TOKEN` (el "API Read Access Token" de la cuenta de TMDB) la búsqueda queda
 * deshabilitada y los objetos se cargan a mano, con la tapa genérica.
 */

import type { ItemTranslations } from "@/lib/db/schema";
import { LOCALES, TMDB_LANGUAGE, type Locale } from "@/lib/i18n";

const BASE = "https://api.themoviedb.org/3";

export function tmdbEnabled(): boolean {
  return Boolean(process.env.TMDB_API_TOKEN);
}

async function tmdbGet<T>(path: string, locale: Locale, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) throw new Error("TMDB no está configurado (falta TMDB_API_TOKEN).");
  const url = new URL(BASE + path);
  url.searchParams.set("language", TMDB_LANGUAGE[locale]);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    // Los datos de una película no cambian de un minuto a otro.
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) throw new Error(`TMDB respondió ${res.status} en ${path}`);
  return (await res.json()) as T;
}

export interface TmdbResult {
  kind: "movie" | "tv";
  id: number;
  title: string;
  originalTitle: string | null;
  year: string | null;
  overview: string | null;
  posterPath: string | null;
}

interface RawSearchItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
}

function yearOf(date: string | undefined): string | null {
  return date && /^\d{4}/.test(date) ? date.slice(0, 4) : null;
}

export function mapSearchItem(kind: "movie" | "tv", raw: RawSearchItem): TmdbResult {
  const title = (kind === "movie" ? raw.title : raw.name) ?? raw.title ?? raw.name ?? "";
  const original = (kind === "movie" ? raw.original_title : raw.original_name) ?? null;
  return {
    kind,
    id: raw.id,
    title,
    originalTitle: original && original !== title ? original : null,
    year: yearOf(kind === "movie" ? raw.release_date : raw.first_air_date),
    overview: raw.overview?.trim() || null,
    posterPath: raw.poster_path ?? null,
  };
}

export async function searchTmdb(kind: "movie" | "tv", query: string, locale: Locale): Promise<TmdbResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await tmdbGet<{ results: RawSearchItem[] }>(`/search/${kind}`, locale, { query: q, include_adult: "false" });
  return data.results.slice(0, 12).map((r) => mapSearchItem(kind, r));
}

export interface TmdbSeason {
  seasonNumber: number;
  name: string;
  year: string | null;
  episodeCount: number | null;
  posterPath: string | null;
}

interface RawSeason {
  season_number: number;
  name: string;
  air_date?: string | null;
  episode_count?: number;
  poster_path?: string | null;
}

interface RawShow {
  name?: string;
  overview?: string;
  poster_path?: string | null;
  genres?: { name: string }[];
  seasons?: RawSeason[];
}

function mapSeasons(data: RawShow): TmdbSeason[] {
  return (data.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      year: yearOf(s.air_date ?? undefined),
      episodeCount: s.episode_count ?? null,
      posterPath: s.poster_path ?? null,
    }));
}

/** Las temporadas de una serie, sin los "especiales" (temporada 0). Cada una tiene su tapa. */
export async function tvSeasons(tvId: number, locale: Locale): Promise<{ posterPath: string | null; genre: string | null; seasons: TmdbSeason[] }> {
  const data = await tmdbGet<RawShow>(`/tv/${tvId}`, locale);
  return { posterPath: data.poster_path ?? null, genre: genreLabel(data.genres), seasons: mapSeasons(data) };
}

/** Los géneros como se guardan: los dos primeros, separados por coma ("Drama, Crimen"). */
export function genreLabel(genres: { name: string }[] | undefined): string | null {
  const names = (genres ?? []).map((g) => g.name).filter(Boolean).slice(0, 2);
  return names.length ? names.join(", ") : null;
}

interface RawMovie {
  title?: string;
  overview?: string;
  poster_path?: string | null;
  genres?: { name: string }[];
  credits?: { crew?: { job: string; name: string }[] };
}

/** Dirección (puede haber más de una persona) y géneros de una película, en una sola llamada. */
export async function movieDetails(movieId: number, locale: Locale): Promise<{ director: string | null; genre: string | null }> {
  const data = await tmdbGet<RawMovie>(`/movie/${movieId}`, locale, { append_to_response: "credits" });
  const names = (data.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name);
  return { director: names.length ? names.join(", ") : null, genre: genreLabel(data.genres) };
}

/**
 * Título, sinopsis, género y tapa de un título de TMDB en cada idioma de la app. En una serie, la
 * tapa es la de la temporada (si TMDB la tiene en ese idioma; si no, la de la serie). Lo que TMDB
 * no tiene traducido (una sinopsis vacía) queda afuera y se usa lo común.
 */
export async function tmdbTranslations(externalId: string, season?: string | null): Promise<ItemTranslations> {
  const match = /^(movie|tv):(\d+)$/.exec(externalId);
  if (!match) return {};
  const [, kind, id] = match;
  const out: ItemTranslations = {};
  await Promise.all(
    LOCALES.map(async (locale) => {
      if (kind === "movie") {
        const m = await tmdbGet<RawMovie>(`/movie/${id}`, locale);
        out[locale] = { name: m.title, description: m.overview?.trim() || null, genre: genreLabel(m.genres), coverRef: m.poster_path ?? null };
      } else {
        const s = await tmdbGet<RawShow>(`/tv/${id}`, locale);
        const seasonPoster = season ? mapSeasons(s).find((x) => String(x.seasonNumber) === String(season))?.posterPath : null;
        out[locale] = { name: s.name, description: s.overview?.trim() || null, genre: genreLabel(s.genres), coverRef: seasonPoster ?? s.poster_path ?? null };
      }
    }),
  );
  return out;
}
