import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mapAlbum, mapBook, searchAlbums } from "@/lib/catalogs";
import { coverUrl, isValidCover } from "@/lib/covers";

describe("Open Library", () => {
  it("arma el libro con autor, año, editorial, ISBN y tapa", () => {
    const r = mapBook({
      key: "/works/OL14860424W",
      title: "Rayuela",
      author_name: ["Julio Cortázar"],
      first_publish_year: 1963,
      cover_i: 1047466,
      isbn: ["8400071123", "9780380003723", "9789505111879"],
      publisher: ["Sudamericana"],
    });
    assert.equal(r.externalId, "work:OL14860424W");
    assert.deepEqual(r.cover, { source: "openlibrary", ref: "1047466" });
    // Entre los ISBN-13, el de una edición en castellano si hay.
    assert.deepEqual(r.attributes, { author: "Julio Cortázar", year: "1963", isbn: "9789505111879", publisher: "Sudamericana" });
  });

  it("sin tapa ni datos, sólo el título", () => {
    const r = mapBook({ key: "/works/OL1W", title: "Sin nada" });
    assert.equal(r.cover, null);
    assert.deepEqual(r.attributes, {});
  });
});

describe("MusicBrainz", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("arma el disco con artista, año, el género más votado y la tapa de Cover Art Archive", () => {
    const r = mapAlbum({
      id: "8e50433a-c1d5-3019-a48d-0d6b97a5f32b",
      title: "Artaud",
      "first-release-date": "1973-10",
      "artist-credit": [{ name: "Pescado Rabioso" }],
      tags: [
        { name: "psychedelic rock", count: 1 },
        { name: "rock nacional", count: 4 },
      ],
    });
    assert.equal(r.externalId, "release-group:8e50433a-c1d5-3019-a48d-0d6b97a5f32b");
    assert.deepEqual(r.attributes, { artist: "Pescado Rabioso", year: "1973", genre: "Rock nacional" });
    assert.equal(r.cover?.source, "coverartarchive");
  });

  it("se identifica con un User-Agent propio y pone los álbumes primero", async () => {
    let ua: string | null = null;
    globalThis.fetch = (async (_url: URL, init: RequestInit) => {
      ua = new Headers(init.headers).get("user-agent");
      return Response.json({
        "release-groups": [
          { id: "00000000-0000-0000-0000-000000000001", title: "Simple", "primary-type": "Single" },
          { id: "00000000-0000-0000-0000-000000000002", title: "Disco", "primary-type": "Album" },
        ],
      });
    }) as typeof fetch;
    const results = await searchAlbums("algo");
    assert.deepEqual(results.map((r) => r.title), ["Disco", "Simple"]);
    assert.match(ua!, /^TheVault\//);
  });
});

describe("tapas de los catálogos", () => {
  it("arma la URL de cada fuente", () => {
    assert.equal(coverUrl("openlibrary", "1047466", "md"), "https://covers.openlibrary.org/b/id/1047466-M.jpg");
    assert.equal(
      coverUrl("coverartarchive", "8e50433a-c1d5-3019-a48d-0d6b97a5f32b", "sm"),
      "https://coverartarchive.org/release-group/8e50433a-c1d5-3019-a48d-0d6b97a5f32b/front-250",
    );
  });

  it("no acepta referencias que no son de la fuente", () => {
    assert.equal(isValidCover("openlibrary", "../x"), false);
    assert.equal(isValidCover("coverartarchive", "https://evil.example/x.jpg"), false);
  });
});
