"use client";

import { useEffect, useState } from "react";
import { tvSeasonsAction } from "@/lib/actions/tmdb";
import type { TmdbSeason } from "@/lib/tmdb";
import { missingSeasons } from "@/lib/seasons";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

/** Lo que TMDB dice de cada serie, una vez por sesión: las temporadas no cambian minuto a minuto. */
const cache = new Map<number, Promise<TmdbSeason[] | null>>();

function seasonsOf(tvId: number): Promise<TmdbSeason[] | null> {
  let hit = cache.get(tvId);
  if (!hit) {
    hit = tvSeasonsAction(tvId).then((res) => (res.ok ? res.data.seasons : null));
    cache.set(tvId, hit);
  }
  return hit;
}

/**
 * Qué temporadas de la serie tenés y cuáles te faltan, según TMDB. Cuenta todas las temporadas de
 * la colección (estén en el contenedor que estén), no sólo la que está elegida.
 */
export function SeasonsCheck({ tvId, owned }: { tvId: number; owned: Set<number> }) {
  const [state, setState] = useState<{ id: number; seasons: TmdbSeason[] | null } | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    let alive = true;
    void seasonsOf(tvId).then((seasons) => alive && setState({ id: tvId, seasons }));
    return () => {
      alive = false;
    };
  }, [tvId]);

  if (!state || state.id !== tvId) return <p className="mt-4 text-xs text-muted-foreground">{t.panel.seasonsLoading}</p>;
  if (!state.seasons) return <p className="mt-4 text-xs text-muted-foreground">{t.panel.seasonsError}</p>;

  const { aired, missing } = missingSeasons(state.seasons, owned);
  if (!aired.length) return null;

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">
        {missing.length === 0
          ? t.panel.seasonsComplete
          : missing.length === 1
            ? t.panel.seasonsMissingOne(missing[0])
            : t.panel.seasonsMissing(missing.length, aired.length)}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t.panel.seasons}>
        {aired.map((s) => {
          const has = owned.has(s.seasonNumber);
          return (
            <li
              key={s.seasonNumber}
              title={`${s.name}${s.year ? ` (${s.year})` : ""}${has ? "" : t.panel.seasonMissingTitle}`}
              className={cn(
                "grid h-7 min-w-9 place-items-center rounded px-1.5 text-xs font-semibold tabular-nums",
                has ? "bg-marker text-white" : "border-2 border-dashed border-marker-red text-marker-red",
              )}
            >
              <span>
                {t.seasonShort(s.seasonNumber)}
                <span className="sr-only">{has ? t.panel.seasonHave : t.panel.seasonMissing}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
