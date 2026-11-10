import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messages } from "@/lib/i18n";
import { cleanAttributes, isItemType, subtitle, typeDef } from "@/lib/item-types";

const { es, en } = messages;

describe("cleanAttributes", () => {
  it("deja sólo los campos del tipo, recortados y sin vacíos", () => {
    const out = cleanAttributes("series", { season: " 2 ", format: "DVD", director: "x", discs: "", foo: "bar" });
    assert.deepEqual(out, { season: "2", format: "DVD" });
  });

  it("descarta un número que no es número y una opción que no está en la lista", () => {
    assert.deepEqual(cleanAttributes("movie", { year: "mil novecientos", format: "Betamax" }), {});
  });

  it("un tipo desconocido no guarda atributos", () => {
    assert.deepEqual(cleanAttributes("nave-espacial", { season: "1" }), {});
    assert.equal(isItemType("nave-espacial"), false);
    assert.equal(typeDef("nave-espacial").brandModel, true, "cae en Otro");
  });
});

describe("subtitle", () => {
  it("serie: temporada y formato", () => {
    assert.equal(subtitle("series", { season: "3", format: "DVD" }, es), "Temporada 3 · DVD");
    assert.equal(subtitle("series", { season: "3", format: "DVD" }, en), "Season 3 · DVD");
  });

  it("película: año y formato, salteando lo que falta", () => {
    assert.equal(subtitle("movie", { format: "Blu-ray" }, es), "Blu-ray");
    // Los valores se guardan en castellano y se muestran traducidos.
    assert.equal(subtitle("music", { artist: "Charly García", format: "Vinilo" }, en), "Charly García · Vinyl");
  });

  it("otro: marca y modelo", () => {
    assert.equal(subtitle("other", {}, es, "Sony", "PS2"), "Sony · PS2");
  });
});
