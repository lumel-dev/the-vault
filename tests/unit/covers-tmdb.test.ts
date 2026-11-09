import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { coverUrl, isValidCover } from "@/lib/covers";
import { mapSearchItem, searchTmdb, tvSeasons } from "@/lib/tmdb";

describe("covers", () => {
  it("arma la URL de TMDB con el tamaño pedido", () => {
    assert.equal(coverUrl("tmdb", "/abc123.jpg", "sm"), "https://image.tmdb.org/t/p/w154/abc123.jpg");
  });

  it("no acepta URLs completas ni paths raros: la app no sirve imágenes de cualquier lado", () => {
    assert.equal(isValidCover("tmdb", "https://evil.example/x.jpg"), false);
    assert.equal(isValidCover("tmdb", "/../x.jpg"), false);
    assert.equal(isValidCover("imgur", "/abc.jpg"), false);
    assert.equal(coverUrl("tmdb", null), null);
  });
});

describe("tmdb", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.TMDB_API_TOKEN;
  });

  it("mapea una película con año y título original sólo si difiere", () => {
    const r = mapSearchItem("movie", {
      id: 603,
      title: "Matrix",
      original_title: "The Matrix",
      release_date: "1999-03-30",
      poster_path: "/p.jpg",
      overview: "  ",
    });
    assert.deepEqual(r, { kind: "movie", id: 603, title: "Matrix", originalTitle: "The Matrix", year: "1999", overview: null, posterPath: "/p.jpg" });
  });

  it("busca con el token en el header, nunca en la URL", async () => {
    process.env.TMDB_API_TOKEN = "secreto";
    let seen: { url: string; auth: string | null } | null = null;
    globalThis.fetch = (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), auth: new Headers(init.headers).get("authorization") };
      return Response.json({ results: [{ id: 1, name: "Lost", first_air_date: "2004-09-22", poster_path: null }] });
    }) as typeof fetch;

    const results = await searchTmdb("tv", "lost");
    assert.equal(results[0].title, "Lost");
    assert.equal(results[0].year, "2004");
    assert.equal(seen!.auth, "Bearer secreto");
    assert.ok(!seen!.url.includes("secreto"));
    assert.ok(seen!.url.includes("/search/tv"));
  });

  it("las temporadas no incluyen los especiales (temporada 0)", async () => {
    process.env.TMDB_API_TOKEN = "t";
    globalThis.fetch = (async () =>
      Response.json({
        poster_path: "/show.jpg",
        seasons: [
          { season_number: 0, name: "Especiales" },
          { season_number: 1, name: "Temporada 1", air_date: "2004-09-22", episode_count: 25, poster_path: "/s1.jpg" },
        ],
      })) as unknown as typeof fetch;

    const { posterPath, seasons } = await tvSeasons(4607);
    assert.equal(posterPath, "/show.jpg");
    assert.deepEqual(seasons, [{ seasonNumber: 1, name: "Temporada 1", year: "2004", episodeCount: 25, posterPath: "/s1.jpg" }]);
  });

  it("sin token falla claro en vez de pegarle a la API", async () => {
    await assert.rejects(searchTmdb("movie", "x"), /TMDB_API_TOKEN/);
  });
});
