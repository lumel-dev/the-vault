import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { crearUsuario, limpiar, sesionComo, sinBase } from "./base";

const { createItem, updateItem } = await import("@/lib/actions/items");
const { createSticker, deleteSticker, updateSticker } = await import("@/lib/actions/stickers");
const { listItems, listStickers } = await import("@/lib/queries");

function ok<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) assert.fail(res.error);
  return res.data;
}

describe("stickers", { skip: sinBase }, () => {
  let ana: string;
  let beto: string;

  beforeEach(async () => {
    await limpiar();
    ana = await crearUsuario("ana@example.com");
    beto = await crearUsuario("beto@example.com");
    sesionComo(ana);
  });

  after(() => sesionComo(null));

  it("una cuenta arranca con los seis de fábrica, una sola vez", async () => {
    const [a, b] = await Promise.all([listStickers(ana), listStickers(ana)]);
    assert.deepEqual(
      a.map((s) => s.base),
      ["movie", "series", "book", "music", "game", "other"],
    );
    assert.equal(b.length, 6);
    assert.equal((await listStickers(ana)).length, 6);
  });

  it("lo cargado sin sticker toma el primero de su tipo, y el tipo sale del sticker", async () => {
    const series = (await listStickers(ana)).find((s) => s.base === "series")!;
    const { id } = ok(await createItem({ type: "movie", name: "Lost" }));
    const anime = ok(await createSticker({ name: "Anime", color: "#d4498f", base: "series" })).id;
    // Aunque diga "movie", con el sticker Anime es una serie.
    const { id: eva } = ok(await createItem({ type: "movie", name: "Evangelion", stickerId: anime, attributes: { season: "1", director: "no" } }));
    const items = await listItems(ana);
    const lost = items.find((i) => i.id === id)!;
    const evangelion = items.find((i) => i.id === eva)!;
    assert.equal(lost.stickerId, (await listStickers(ana)).find((s) => s.base === "movie")!.id);
    assert.equal(evangelion.type, "series");
    assert.equal(evangelion.stickerId, anime);
    assert.deepEqual(evangelion.attributes, { season: "1" }, "los campos son los de una serie");
    assert.ok(series.id !== anime);
  });

  it("no se le cambia el tipo a un sticker con cosas; vacío, sí", async () => {
    const anime = ok(await createSticker({ name: "Anime", color: "#d4498f", base: "series" })).id;
    ok(await updateSticker(anime, { name: "Animé", color: "#000000", base: "movie" }));
    ok(await createItem({ type: "movie", name: "Akira", stickerId: anime }));
    assert.equal((await updateSticker(anime, { name: "Animé", color: "#000000", base: "series" })).ok, false);
    ok(await updateSticker(anime, { name: "Anime", color: "#d4498f", base: "movie" }));
    const row = (await listStickers(ana)).find((s) => s.id === anime)!;
    assert.equal(row.name, "Anime");
    assert.equal(row.count, 1);
  });

  it("borrar uno con cosas las pasa a otro del mismo tipo", async () => {
    const pelis = (await listStickers(ana)).find((s) => s.base === "movie")!.id;
    const libros = (await listStickers(ana)).find((s) => s.base === "book")!.id;
    const clasicos = ok(await createSticker({ name: "Clásicos", color: "#8a5a3b", base: "movie" })).id;
    const { id } = ok(await createItem({ type: "movie", name: "Casablanca", stickerId: clasicos }));

    assert.equal((await deleteSticker(clasicos)).ok, false, "sin destino no se borra");
    assert.equal((await deleteSticker(clasicos, libros)).ok, false, "a otro tipo no");
    ok(await deleteSticker(clasicos, pelis));
    const [item] = await listItems(ana);
    assert.equal(item.id, id);
    assert.equal(item.stickerId, pelis);
    assert.equal((await listStickers(ana)).some((s) => s.id === clasicos), false);

    // Vacío se borra sin más.
    const vacio = ok(await createSticker({ color: "#2f6fd6", base: "game" })).id;
    ok(await deleteSticker(vacio));
  });

  it("cada usuario usa y toca sólo sus stickers", async () => {
    const anime = ok(await createSticker({ name: "Anime", color: "#d4498f", base: "series" })).id;
    sesionComo(beto);
    assert.equal((await createItem({ type: "series", name: "X", stickerId: anime })).ok, false);
    assert.equal((await updateSticker(anime, { name: "Mío", color: "#000000", base: "series" })).ok, false);
    assert.equal((await deleteSticker(anime)).ok, false);
    const { id } = ok(await createItem({ type: "series", name: "Y" }));
    assert.equal((await updateItem(id, { type: "series", name: "Y", stickerId: anime })).ok, false);
  });

  it("valida nombre y color", async () => {
    assert.equal((await createSticker({ name: "x".repeat(41), color: "#d4498f", base: "series" })).ok, false);
    assert.equal((await createSticker({ name: "Rojo", color: "red", base: "series" })).ok, false);
    assert.equal((await createSticker({ name: "Raro", color: "#d4498f", base: "planta" })).ok, false);
  });
});
