import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLayout, dropTarget, itemShape } from "@/lib/scene-layout";
import { matcher, search, wordSimilarity, type Searchable } from "@/lib/search";
import { whereabouts, whereLabel } from "@/lib/where";

describe("búsqueda en el browser", () => {
  const items: Searchable[] = [
    { name: "Matrix", attributes: { director: "Lana Wachowski", year: "1999" }, inventoryNumber: 142 },
    { name: "La casa de papel", attributes: { season: "2" }, inventoryNumber: 7 },
    { name: "Acción mutante", attributes: {}, inventoryNumber: 3 },
    { name: "Consola", brand: "Sony", model: "PlayStation 2", attributes: {}, inventoryNumber: 9 },
  ];
  const buscar = (q: string) => items.filter(matcher(q)!).map((i) => i.name);

  it("sin importar mayúsculas ni acentos", () => {
    assert.deepEqual(buscar("ACCION"), ["Acción mutante"]);
  });

  it("tolera un error de tipeo como pg_trgm", () => {
    assert.ok(wordSimilarity("matirx", "matrix") > 0.42);
    assert.deepEqual(buscar("matirx"), ["Matrix"]);
  });

  it("no confunde palabras parecidas pero distintas", () => {
    assert.deepEqual(buscar("cosa"), []);
  });

  it("si hay coincidencias exactas, no agrega las parecidas", () => {
    const series: Searchable[] = [
      { name: "Lost", attributes: { season: "1" } },
      { name: "Los Soprano", attributes: { season: "1" } },
    ];
    assert.deepEqual(search(series, "lost")!.map((i) => i.name), ["Lost"]);
    // Sin exactas, recién ahí entran las parecidas.
    assert.deepEqual(search(items, "matirx")!.map((i) => i.name), ["Matrix"]);
    assert.equal(search(items, "  "), null);
  });

  it("encuentra por atributos, marca, modelo y número de inventario", () => {
    assert.deepEqual(buscar("wachowski"), ["Matrix"]);
    assert.deepEqual(buscar("sony playstation"), ["Consola"]);
    assert.deepEqual(buscar("0142"), ["Matrix"]);
  });

  it("todas las palabras tienen que estar", () => {
    assert.deepEqual(buscar("casa papel"), ["La casa de papel"]);
    assert.deepEqual(buscar("casa matrix"), []);
  });

  it("sin búsqueda no hay buscador", () => {
    assert.equal(matcher("   "), null);
  });
});

describe("medidas reales", () => {
  it("una caja de DVD mide 14 mm de lomo y las de varios discos son más gruesas", () => {
    assert.equal(itemShape({ type: "movie", name: "X", attributes: { format: "DVD" } }).dims.t, 0.014);
    assert.equal(itemShape({ type: "series", name: "X", attributes: { format: "DVD", discs: "6" } }).dims.t, 0.03);
    assert.equal(itemShape({ type: "movie", name: "X", attributes: { format: "Blu-ray" } }).dims.h, 0.17);
    assert.equal(itemShape({ type: "music", name: "X", attributes: { format: "Vinilo" } }).shape, "vinyl");
    assert.equal(itemShape({ type: "other", name: "X", attributes: {} }).shape, "parcel");
  });

  it("un libro tiene siempre las mismas medidas", () => {
    const a = itemShape({ type: "book", name: "Rayuela", attributes: {} });
    const b = itemShape({ type: "book", name: "Rayuela", attributes: {} });
    assert.deepEqual(a, b);
  });
});

describe("armado de la escena", () => {
  const containers = [
    { id: "living", name: "Living", kind: "shelf", levels: 2 },
    { id: "caja", name: "Caja 3", kind: "box", levels: 1 },
  ];
  const item = (id: string, shelfId: string | null, level = 0) => ({ id, shelfId, level, type: "movie", name: id, attributes: { format: "DVD" } });
  const items = [item("a", "living"), item("b", "living"), item("c", "living", 1), item("d", "caja"), item("e", null), item("f", "otro-usuario")];
  const layout = buildLayout(containers, items);

  it("pone cada objeto en su contenedor, estante y lugar", () => {
    const byId = new Map(layout.items.map((p) => [p.id, p]));
    assert.equal(byId.get("a")!.index, 0);
    assert.equal(byId.get("b")!.index, 1);
    assert.equal(byId.get("c")!.level, 1);
    assert.ok(byId.get("a")!.position[1] > byId.get("c")!.position[1], "el estante 1 está arriba del 2");
    assert.equal(byId.get("d")!.upright, false, "en una caja, lomo arriba");
    // Un contenedor que no existe se trata como sin ubicar.
    assert.equal(byId.get("f")!.containerId, null);
  });

  it("los muebles no se pisan y la mesa de sin ubicar va al final", () => {
    const [living, caja, mesa] = layout.containers;
    assert.ok(living.x + living.width < caja.x);
    assert.ok(caja.x + caja.width < mesa.x);
    assert.equal(mesa.kind, "table");
  });

  it("soltar entre dos lomos cae en ese hueco", () => {
    const slot = layout.slots.find((s) => s.containerId === "living" && s.level === 0)!;
    const between = slot.edges[1];
    assert.equal(dropTarget(layout, between - 0.001, slot.floor + 0.1)!.index, 1);
    assert.equal(dropTarget(layout, slot.x1 - 0.01, slot.floor + 0.1)!.index, 2);
    assert.equal(dropTarget(layout, -5, 0.5), null);
  });
});

describe("dónde está", () => {
  const shelves = [{ id: "living", name: "Living", kind: "shelf", levels: 3 }, { id: "caja", name: "Caja 3", kind: "box", levels: 1 }];
  const ordered = [
    { id: "a", shelfId: "caja", level: 0 },
    { id: "b", shelfId: "living", level: 1 },
    { id: "c", shelfId: "caja", level: 0 },
    { id: "d", shelfId: null, level: 0 },
  ];

  it("lo dice como en la casa", () => {
    assert.equal(whereLabel(whereabouts(ordered[2], ordered, shelves)), "Caja 3 · 2.º lugar");
    assert.equal(whereLabel(whereabouts(ordered[1], ordered, shelves)), "Living · Estante 2 · 1.º lugar");
    assert.equal(whereLabel(whereabouts(ordered[3], ordered, shelves)), "Sin ubicar · 1.º lugar");
  });
});
