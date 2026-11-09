"use server";

import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { movieDirector, searchTmdb, tvSeasons, type TmdbResult, type TmdbSeason } from "@/lib/tmdb";
import type { ActionResult } from "./items";

// Pasan por el server para que el token de TMDB no llegue nunca al browser.

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireUserId();
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    console.error("[tmdb]", error);
    return { ok: false, error: "No se pudo consultar TMDB" };
  }
}

export async function searchTmdbAction(kind: "movie" | "tv", query: string): Promise<ActionResult<TmdbResult[]>> {
  const k = z.enum(["movie", "tv"]).parse(kind);
  const q = z.string().max(200).parse(query);
  return run(() => searchTmdb(k, q));
}

export async function tvSeasonsAction(tvId: number): Promise<ActionResult<{ posterPath: string | null; seasons: TmdbSeason[] }>> {
  const id = z.number().int().positive().parse(tvId);
  return run(() => tvSeasons(id));
}

export async function movieDirectorAction(movieId: number): Promise<ActionResult<string | null>> {
  const id = z.number().int().positive().parse(movieId);
  return run(() => movieDirector(id));
}
