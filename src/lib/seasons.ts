import type { TmdbSeason } from "./tmdb";

/** Las temporadas que salieron (sin las que todavía no se estrenaron) y cuáles faltan. */
export function missingSeasons(all: TmdbSeason[], owned: Set<number>, today = new Date().getFullYear()): { aired: TmdbSeason[]; missing: number[] } {
  const aired = all.filter((s) => !s.year || Number(s.year) <= today);
  return { aired, missing: aired.map((s) => s.seasonNumber).filter((n) => !owned.has(n)) };
}

