import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { localeFromAcceptLanguage, messages } from "@/lib/i18n";
import { localize } from "@/lib/localized";
import { search } from "@/lib/search";
import { tmdbTranslations } from "@/lib/tmdb";

/** Todas las rutas de claves de un diccionario ("toast.moved", "types.movie.label"…). */
function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("diccionarios", () => {
  it("es y en tienen exactamente las mismas claves", () => {
    assert.deepEqual(keys(messages.en).sort(), keys(messages.es).sort());
  });

  it("ningún texto en inglés quedó vacío ni igual al castellano en frases largas", () => {
    const es = keys(messages.es);
    for (const k of es) {
      const get = (o: object) => k.split(".").reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], o);
      const a = get(messages.es);
      const b = get(messages.en);
      if (typeof a === "string" && typeof b === "string") {
        assert.ok(b.length > 0, k);
        if (a.length > 25) assert.notEqual(a, b, `${k} sin traducir`);
      }
    }
  });

  it("el idioma del navegador decide antes de entrar", () => {
    assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9"), "en");
    assert.equal(localeFromAcceptLanguage("es-AR,es;q=0.9,en;q=0.8"), "es");
    assert.equal(localeFromAcceptLanguage(null), "es");
  });
});

describe("lo que se muestra en cada idioma", () => {
  const pulp = {
    name: "Tiempos violentos",
    description: "Sinopsis en castellano",
    attributes: { year: "1994", genre: "Crimen", format: "DVD" },
    coverSource: "tmdb",
    coverRef: "/es.jpg",
    translations: {
      es: { name: "Tiempos violentos", description: "Sinopsis en castellano", genre: "Crimen", coverRef: "/es.jpg" },
      en: { name: "Pulp Fiction", description: "Synopsis in English", genre: "Crime", coverRef: "/en.jpg" },
    },
  };

  it("toma título, sinopsis, género y tapa del idioma elegido", () => {
    const en = localize(pulp, "en");
    assert.equal(en.name, "Pulp Fiction");
    assert.equal(en.description, "Synopsis in English");
    assert.equal(en.attributes.genre, "Crime");
    assert.equal(en.attributes.format, "DVD");
    assert.equal(en.coverRef, "/en.jpg");
    assert.deepEqual(en.aliases, ["Tiempos violentos"]);
  });

  it("sin traducción, queda lo común", () => {
    const manual = { ...pulp, name: "Mi DVD casero", translations: {} };
    assert.equal(localize(manual, "en").name, "Mi DVD casero");
  });

  it("se encuentra por el título en cualquier idioma", () => {
    const shown = [localize(pulp, "es")];
    assert.equal(search(shown, "pulp fiction")!.length, 1);
    assert.equal(search(shown, "tiempos")!.length, 1);
  });
});

describe("TMDB en los dos idiomas", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.TMDB_API_TOKEN;
  });

  it("pide cada idioma y en una serie usa la tapa de la temporada", async () => {
    process.env.TMDB_API_TOKEN = "t";
    const asked: string[] = [];
    globalThis.fetch = (async (url: URL) => {
      const lang = url.searchParams.get("language")!;
      asked.push(lang);
      const es = lang === "es-MX";
      return Response.json({
        name: es ? "Perdidos" : "Lost",
        overview: es ? "Un avión cae" : "A plane crashes",
        genres: [{ name: es ? "Misterio" : "Mystery" }],
        poster_path: es ? "/show-es.jpg" : "/show-en.jpg",
        seasons: [{ season_number: 2, name: "S2", poster_path: es ? "/s2-es.jpg" : "/s2-en.jpg" }],
      });
    }) as unknown as typeof fetch;

    const tr = await tmdbTranslations("tv:4607", "2");
    assert.deepEqual(asked.sort(), ["en-US", "es-MX"]);
    assert.deepEqual(tr.es, { name: "Perdidos", description: "Un avión cae", genre: "Misterio", coverRef: "/s2-es.jpg" });
    assert.equal(tr.en?.name, "Lost");
    assert.equal(tr.en?.coverRef, "/s2-en.jpg");
  });

  it("un id que no es de TMDB no pide nada", async () => {
    assert.deepEqual(await tmdbTranslations("work:OL1W"), {});
  });
});
