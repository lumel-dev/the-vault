import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { missingSeasons } from "@/lib/seasons";

const season = (n: number, year: string | null) => ({ seasonNumber: n, name: `Temporada ${n}`, year, episodeCount: 10, posterPath: null });

describe("temporadas que faltan", () => {
  const all = [season(1, "2004"), season(2, "2005"), season(3, "2006"), season(4, "2030")];

  it("dice cuáles faltan entre las que ya salieron", () => {
    const { aired, missing } = missingSeasons(all, new Set([1, 3]), 2026);
    assert.deepEqual(aired.map((s) => s.seasonNumber), [1, 2, 3]);
    assert.deepEqual(missing, [2]);
  });

  it("completa cuando están todas las que salieron", () => {
    assert.deepEqual(missingSeasons(all, new Set([1, 2, 3]), 2026).missing, []);
  });
});
