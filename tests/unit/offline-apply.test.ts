import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messages } from "@/lib/i18n";
import { applyOp, applyOps, validateOp, type VaultData } from "@/lib/offline/apply";
import { LAST, type Op } from "@/lib/offline/ops";
import type { VaultItem } from "@/lib/queries";

const t = messages.es;
const SHELF = "11111111-1111-4111-8111-111111111111";
const BOX = "22222222-2222-4222-8222-222222222222";
const MOVIES = "33333333-3333-4333-8333-333333333333";
const SERIES = "44444444-4444-4444-8444-444444444444";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function item(n: number, name: string, shelfId: string | null, extra: Partial<VaultItem> = {}): VaultItem {
  return {
    id: id(n),
    shelfId,
    level: 0,
    type: "movie",
    stickerId: MOVIES,
    name,
    description: null,
    brand: null,
    model: null,
    attributes: {},
    translations: {},
    coverSource: null,
    coverRef: null,
    externalSource: null,
    externalId: null,
    position: n,
    inventoryNumber: n,
    ...extra,
  };
}

function base(): VaultData {
  return {
    items: [item(1, "Alien", SHELF), item(2, "Brazil", SHELF), item(3, "Casablanca", null)],
    shelves: [
      { id: SHELF, name: "Pelis", kind: "shelf", position: 1, count: 2 },
      { id: BOX, name: "Caja", kind: "box", position: 2, count: 0 },
    ],
    stickers: [
      { id: MOVIES, base: "movie", name: null, color: "#e2412f", position: 0, count: 3 },
      { id: SERIES, base: "series", name: null, color: "#2f6fd6", position: 1, count: 0 },
    ],
  };
}

const names = (d: VaultData, shelfId?: string | null) =>
  d.items.filter((i) => shelfId === undefined || i.shelfId === shelfId).map((i) => i.name);

describe("cola sin señal: aplicar cambios sobre la copia del browser", () => {
  it("lo nuevo sin ubicar va primero; a un mueble, al final, con el tipo de su sticker", () => {
    const d = applyOps(base(), [
      { kind: "createItem", id: id(10), input: { type: "movie", name: "Dune", shelfId: null } },
      { kind: "createItem", id: id(11), input: { type: "movie", name: "Lost", shelfId: SHELF, stickerId: SERIES, attributes: { season: "1", director: "x" } } },
    ]);
    assert.deepEqual(names(d), ["Dune", "Alien", "Brazil", "Lost", "Casablanca"]);
    const lost = d.items.find((i) => i.name === "Lost")!;
    assert.equal(lost.type, "series");
    assert.deepEqual(lost.attributes, { season: "1" }, "sólo los campos de una serie");
    assert.equal(lost.inventoryNumber, 0, "sin número hasta que lo guarde el server");
    assert.equal(d.shelves.find((s) => s.id === SHELF)!.count, 3);
    assert.equal(d.unshelved, 2);
    assert.equal(d.stickers.find((s) => s.id === SERIES)!.count, 1);
  });

  it("crear dos veces lo mismo no lo duplica (la cola se vuelve a aplicar sobre cada colección nueva)", () => {
    const op: Op = { kind: "createItem", id: id(10), input: { type: "movie", name: "Dune" } };
    const once = applyOps(base(), [op]);
    assert.equal(applyOps(once, [op]).items.length, 4);
  });

  it("una temporada nueva entra al lado de sus hermanas", () => {
    const d = base();
    d.items.splice(1, 0, item(5, "Friends", SHELF, { type: "series", stickerId: SERIES, externalId: "tv:1668", attributes: { season: "1" } }));
    const after = applyOp(d, {
      kind: "createItem",
      id: id(12),
      input: { type: "series", name: "Friends", shelfId: SHELF, stickerId: SERIES, externalSource: "tmdb", externalId: "tv:1668", attributes: { season: "2" } },
    });
    assert.deepEqual(
      after.items.filter((i) => i.shelfId === SHELF).map((i) => `${i.name}${i.attributes.season ?? ""}`),
      ["Alien", "Friends1", "Friends2", "Brazil"],
    );
  });

  it("mover: a un mueble al final, a sin ubicar primero, y a un lugar concreto", () => {
    let d = applyOp(base(), { kind: "placeItem", id: id(3), shelfId: SHELF, index: LAST });
    assert.deepEqual(names(d, SHELF), ["Alien", "Brazil", "Casablanca"]);
    d = applyOp(d, { kind: "placeItem", id: id(2), shelfId: null, index: 0 });
    d = applyOp(d, { kind: "placeItem", id: id(1), shelfId: null, index: 0 });
    assert.deepEqual(names(d, null), ["Alien", "Brazil"]);
    d = applyOp(d, { kind: "placeItem", id: id(2), shelfId: SHELF, index: 0 });
    assert.deepEqual(names(d, SHELF), ["Brazil", "Casablanca"]);
  });

  it("reordenar toma los lugares que ya ocupaban; lo demás no se mueve", () => {
    const d = applyOp(base(), { kind: "reorderItems", ids: [id(2), id(1)] });
    assert.deepEqual(names(d), ["Brazil", "Alien", "Casablanca"]);
  });

  it("editar cambia de lugar sólo si cambió el contenedor", () => {
    const input = { type: "movie", name: "Alien (1979)", shelfId: SHELF };
    let d = applyOp(base(), { kind: "updateItem", id: id(1), input, locale: "es" });
    assert.deepEqual(names(d), ["Alien (1979)", "Brazil", "Casablanca"]);
    d = applyOp(d, { kind: "updateItem", id: id(1), input: { ...input, shelfId: BOX }, locale: "es" });
    assert.deepEqual(names(d, BOX), ["Alien (1979)"]);
  });

  it("borrar un contenedor deja lo suyo sin ubicar; borrar un sticker con cosas las pasa a otro del mismo tipo", () => {
    let d = applyOps(base(), [{ kind: "deleteShelf", id: SHELF }]);
    assert.equal(d.unshelved, 3);
    const clasicos = id(20);
    d = applyOps(d, [
      { kind: "createSticker", id: clasicos, input: { name: "Clásicos", color: "#8a5a3b", base: "movie" } },
      { kind: "updateItem", id: id(3), input: { type: "movie", name: "Casablanca", stickerId: clasicos }, locale: "es" },
      { kind: "deleteSticker", id: clasicos, moveTo: MOVIES },
    ]);
    assert.equal(d.items.find((i) => i.id === id(3))!.stickerId, MOVIES);
    assert.equal(d.stickers.some((s) => s.id === clasicos), false);
  });

  it("lo que ya no tiene sobre qué aplicarse se saltea", () => {
    const d = applyOps(base(), [
      { kind: "deleteItem", id: id(1) },
      { kind: "placeItem", id: id(1), shelfId: BOX, index: 0 },
      { kind: "updateItem", id: id(1), input: { type: "movie", name: "X" }, locale: "es" },
    ]);
    assert.deepEqual(names(d), ["Brazil", "Casablanca"]);
  });

  it("valida antes de encolar, con los mismos textos que el server", () => {
    const d = base();
    assert.equal(validateOp(d, { kind: "createItem", id: id(9), input: { type: "movie", name: " " } }, t), t.errors.nameMissing);
    assert.equal(validateOp(d, { kind: "createShelf", id: id(9), input: { name: "Pelis", kind: "shelf" } }, t), t.errors.duplicateContainer);
    assert.equal(validateOp(d, { kind: "updateSticker", id: MOVIES, input: { color: "#000000", base: "series" } }, t), t.errors.stickerBaseLocked);
    assert.equal(validateOp(d, { kind: "deleteSticker", id: MOVIES, moveTo: null }, t), t.errors.stickerInUse);
    assert.equal(validateOp(d, { kind: "deleteSticker", id: MOVIES, moveTo: SERIES }, t), t.errors.stickerMoveBase);
    assert.equal(validateOp(d, { kind: "createItem", id: id(9), input: { type: "movie", name: "Ok", shelfId: BOX } }, t), null);
  });
});
