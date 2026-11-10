"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { messages, type Locale } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { movieDetails, searchTmdb, tvSeasons, type TmdbResult, type TmdbSeason } from "@/lib/tmdb";
import type { ActionResult } from "./items";

// Pasan por el server para que el token de TMDB no llegue nunca al browser. Todo se pide en el
// idioma del usuario: es lo que ve en los resultados y lo que se carga en el formulario.

async function run<T>(fn: (locale: Locale) => Promise<T>): Promise<ActionResult<T>> {
  const locale = await getUserLocale(await requireUserId());
  try {
    return { ok: true, data: await fn(locale) };
  } catch (error) {
    console.error("[tmdb]", error);
    return { ok: false, error: messages[locale].errors.tmdb };
  }
}

export async function searchTmdbAction(kind: "movie" | "tv", query: string): Promise<ActionResult<TmdbResult[]>> {
  const k = z.enum(["movie", "tv"]).parse(kind);
  const q = z.string().max(200).parse(query);
  return run((locale) => searchTmdb(k, q, locale));
}

export async function tvSeasonsAction(tvId: number): Promise<ActionResult<{ posterPath: string | null; genre: string | null; seasons: TmdbSeason[] }>> {
  const id = z.number().int().positive().parse(tvId);
  return run((locale) => tvSeasons(id, locale));
}

export async function movieDetailsAction(movieId: number): Promise<ActionResult<{ director: string | null; genre: string | null }>> {
  const id = z.number().int().positive().parse(movieId);
  return run((locale) => movieDetails(id, locale));
}
