import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import { crearUsuario, limpiar, sesionComo, sinBase } from "./base";

const { applyQueued } = await import("@/lib/offline/server");
const { listItems, listShelves, listStickers } = await import("@/lib/queries");

describe("cola de cambios: aplicar en el server", { skip: sinBase }, () => {
  let ana: string;
  let beto: string;

  beforeEach(async () => {
    await limpiar();
    ana = await crearUsuario("ana@example.com");
    beto = await crearUsuario("beto@example.com");
    sesionComo(ana);
  });

  after(() => sesionComo(null));

  it("reenviar un alta no la duplica ni gasta otro número", async () => {
    const id = randomUUID();
    const op = { kind: "createItem" as const, id, input: { type: "movie", name: "Dune" } };
    const first = await applyQueued(1, op, ana);
    const again = await applyQueued(1, op, ana);
    assert.deepEqual(first, { seq: 1, result: "applied", inventoryNumber: 1 });
    assert.deepEqual(again, first);
    const items = await listItems(ana);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, id);

    const next = await applyQueued(2, { kind: "createItem", id: randomUUID(), input: { type: "movie", name: "Alien" } }, ana);
    assert.deepEqual(next, { seq: 2, result: "applied", inventoryNumber: 2 });
  });

  it("lo mismo con contenedores y stickers", async () => {
    const shelf = randomUUID();
    const sticker = randomUUID();
    for (let i = 0; i < 2; i++) {
      assert.equal((await applyQueued(i, { kind: "createShelf", id: shelf, input: { name: "Living", kind: "shelf" } }, ana)).result, "applied");
      assert.equal((await applyQueued(i, { kind: "createSticker", id: sticker, input: { name: "Anime", color: "#d4498f", base: "series" } }, ana)).result, "applied");
    }
    assert.equal((await listShelves(ana)).shelves.length, 1);
    assert.equal((await listStickers(ana)).filter((s) => s.id === sticker).length, 1);
  });

  it("borrar algo que ya no está cuenta como hecho (es un reenvío)", async () => {
    const id = randomUUID();
    await applyQueued(1, { kind: "createItem", id, input: { type: "movie", name: "Dune" } }, ana);
    assert.equal((await applyQueued(2, { kind: "deleteItem", id }, ana)).result, "applied");
    assert.equal((await applyQueued(2, { kind: "deleteItem", id }, ana)).result, "applied");
  });

  it("un cambio inválido se rechaza con el motivo", async () => {
    const res = await applyQueued(1, { kind: "createItem", id: randomUUID(), input: { type: "movie", name: "" } }, ana);
    assert.equal(res.result, "rejected");
    const moved = await applyQueued(2, { kind: "placeItem", id: randomUUID(), shelfId: null, index: 0 }, ana);
    assert.equal(moved.result, "rejected");
  });

  it("no se puede tomar el id de algo de otra cuenta", async () => {
    const id = randomUUID();
    await applyQueued(1, { kind: "createItem", id, input: { type: "movie", name: "Dune" } }, ana);
    sesionComo(beto);
    const res = await applyQueued(1, { kind: "createItem", id, input: { type: "movie", name: "Mío" } }, beto);
    assert.equal(res.result, "rejected");
    assert.equal((await listItems(beto)).length, 0);
    // Y borrarlo desde la otra cuenta no lo borra (aunque para esa cuenta "ya no está").
    await applyQueued(2, { kind: "deleteItem", id }, beto);
    assert.equal((await listItems(ana)).length, 1);
  });
});
