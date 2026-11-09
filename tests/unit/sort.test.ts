import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortItems, sortName } from "@/lib/sort";

const item = (name: string, type: string, attributes: Record<string, string> = {}) => ({ name, type, attributes });

const items = [
  item("The Matrix", "movie", { year: "1999", genre: "Ciencia ficción" }),
  item("El padrino", "movie", { year: "1972", genre: "Drama, Crimen" }),
  item("Lost", "series", { season: "2", year: "2005", genre: "Drama" }),
  item("Lost", "series", { season: "10", year: "2004" }),
  item("Lost", "series", { season: "1", year: "2004", genre: "Drama" }),
  item("Rayuela", "book", {}),
  item("Ácido", "movie", { year: "2010" }),
];

const names = (list: typeof items) => list.map((i) => (i.attributes.season ? `${i.name} T${i.attributes.season}` : i.name));

describe("ordenar", () => {
  it("por nombre: sin artículos, sin acentos, temporadas en orden numérico", () => {
    assert.equal(sortName("El padrino"), "padrino");
    assert.deepEqual(names(sortItems(items, "name")), ["Ácido", "Lost T1", "Lost T2", "Lost T10", "The Matrix", "El padrino", "Rayuela"]);
  });

  it("por año: lo que no tiene año va al final", () => {
    assert.deepEqual(names(sortItems(items, "year")), ["El padrino", "The Matrix", "Lost T1", "Lost T10", "Lost T2", "Ácido", "Rayuela"]);
  });

  it("por género: lo que no tiene género va al final, ordenado por nombre", () => {
    assert.deepEqual(names(sortItems(items, "genre")), ["The Matrix", "Lost T1", "Lost T2", "El padrino", "Ácido", "Lost T10", "Rayuela"]);
  });

  it("por tipo: en el orden de los tipos y después por nombre", () => {
    assert.deepEqual(names(sortItems(items, "type")), ["Ácido", "The Matrix", "El padrino", "Lost T1", "Lost T2", "Lost T10", "Rayuela"]);
  });

  it("el orden propio no toca nada", () => {
    assert.equal(sortItems(items, "manual"), items);
  });
});
