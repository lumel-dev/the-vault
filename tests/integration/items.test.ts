import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { crearUsuario, db, limpiar, sesionComo, sinBase } from "./base";

const { createItem, deleteItem, moveItem, placeItem, reorderItems, updateItem } = await import("@/lib/actions/items");
const { createShelf, deleteShelf, updateShelf } = await import("@/lib/actions/shelves");
const { listItems, listShelves } = await import("@/lib/queries");
const { sql } = await import("drizzle-orm");

function ok<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) assert.fail(res.error);
  return res.data;
}

async function nuevo(name: string, extra: Record<string, unknown> = {}) {
  return ok(await createItem({ type: "movie", name, attributes: { format: "DVD" }, ...extra })).id;
}

/** Los nombres de un estante, en orden de izquierda a derecha. */
async function estante(userId: string, shelfId: string | null, level = 0) {
  return (await listItems(userId)).filter((i) => i.shelfId === shelfId && i.level === level).map((i) => i.name);
}

describe("items", { skip: sinBase }, () => {
  let ana: string;
  let beto: string;

  beforeEach(async () => {
    await limpiar();
    ana = await crearUsuario("ana@example.com");
    beto = await crearUsuario("beto@example.com");
    sesionComo(ana);
  });

  after(() => sesionComo(null));

  it("lo nuevo queda primero y recibe un número de inventario correlativo", async () => {
    const uno = ok(await createItem({ type: "movie", name: "Uno" }));
    const dos = ok(await createItem({ type: "movie", name: "Dos" }));
    assert.deepEqual((await listItems(ana)).map((i) => i.name), ["Dos", "Uno"]);
    assert.equal(uno.inventoryNumber, 1);
    assert.equal(dos.inventoryNumber, 2);
  });

  it("el número de inventario no se reutiliza al borrar, y es por usuario", async () => {
    await nuevo("A");
    const b = await nuevo("B");
    ok(await deleteItem(b));
    const c = ok(await createItem({ type: "movie", name: "C" }));
    assert.equal(c.inventoryNumber, 3);
    sesionComo(beto);
    assert.equal(ok(await createItem({ type: "movie", name: "De Beto" })).inventoryNumber, 1);
  });

  it("guarda sólo atributos válidos y descarta tapas que no son de TMDB", async () => {
    const { id } = ok(
      await createItem({
        type: "series",
        name: "Lost",
        attributes: { season: "2", format: "DVD", director: "no aplica" },
        coverSource: "tmdb",
        coverRef: "https://evil.example/x.jpg",
      }),
    );
    const [item] = await listItems(ana);
    assert.equal(item.id, id);
    assert.deepEqual(item.attributes, { season: "2", format: "DVD" });
    assert.equal(item.coverRef, null);
  });

  it("guarda libros y discos con su catálogo y su tapa, y descarta ids mal formados", async () => {
    ok(
      await createItem({
        type: "book",
        name: "Rayuela",
        attributes: { author: "Julio Cortázar" },
        coverSource: "openlibrary",
        coverRef: "1047466",
        externalSource: "openlibrary",
        externalId: "work:OL14860424W",
      }),
    );
    ok(
      await createItem({
        type: "music",
        name: "Artaud",
        coverSource: "coverartarchive",
        coverRef: "8e50433a-c1d5-3019-a48d-0d6b97a5f32b",
        externalSource: "musicbrainz",
        externalId: "tv:123",
      }),
    );
    const [disco, libro] = await listItems(ana);
    assert.equal(libro.externalId, "work:OL14860424W");
    assert.equal(libro.coverRef, "1047466");
    assert.equal(disco.coverSource, "coverartarchive");
    // Un id que no es de MusicBrainz no se guarda como si lo fuera.
    assert.equal(disco.externalId, null);
  });

  it("el estante se ajusta a los que tiene el contenedor", async () => {
    const caja = ok(await createShelf({ name: "Caja 3", kind: "box", levels: 5 })).id;
    const mueble = ok(await createShelf({ name: "Living", kind: "shelf", levels: 3 })).id;
    await nuevo("En la caja", { shelfId: caja, level: 4 });
    await nuevo("Abajo", { shelfId: mueble, level: 9 });
    assert.deepEqual(await estante(ana, caja, 0), ["En la caja"]);
    assert.deepEqual(await estante(ana, mueble, 2), ["Abajo"]);
    const shelves = (await listShelves(ana)).shelves;
    assert.equal(shelves.find((s) => s.id === caja)?.levels, 1);
  });

  it("cada usuario ve y toca sólo lo suyo", async () => {
    const id = await nuevo("De Ana");
    sesionComo(beto);
    assert.equal((await listItems(beto)).length, 0);
    assert.equal((await deleteItem(id)).ok, false);
    assert.equal((await updateItem(id, { type: "movie", name: "Robada" })).ok, false);
    assert.equal((await moveItem(id, null)).ok, false);
    assert.equal((await placeItem(id, null, 0, 0)).ok, false);
    assert.equal((await reorderItems([id])).ok, false);

    // Tampoco puede guardar algo en un contenedor ajeno, ni tocarlo.
    sesionComo(ana);
    const living = ok(await createShelf({ name: "Living" })).id;
    sesionComo(beto);
    assert.equal((await createItem({ type: "movie", name: "X", shelfId: living })).ok, false);
    assert.equal((await updateShelf(living, { name: "Mío" })).ok, false);
    assert.equal((await deleteShelf(living)).ok, false);
  });

  it("sin sesión, las acciones se niegan", async () => {
    sesionComo(null);
    await assert.rejects(createItem({ type: "movie", name: "X" }), /No autenticado/);
  });

  it("soltar en un lugar concreto de un estante", async () => {
    const living = ok(await createShelf({ name: "Living", levels: 2 })).id;
    // Estante 1: A B C (se cargan al revés porque lo nuevo queda primero).
    const ids: Record<string, string> = {};
    for (const n of ["C", "B", "A"]) ids[n] = await nuevo(n, { shelfId: living, level: 0 });
    ids.X = await nuevo("X");

    // X, que estaba sin ubicar, va entre A y B.
    ok(await placeItem(ids.X, living, 0, 1));
    assert.deepEqual(await estante(ana, living, 0), ["A", "X", "B", "C"]);
    assert.deepEqual(await estante(ana, null), []);

    // C pasa al principio del mismo estante.
    ok(await placeItem(ids.C, living, 0, 0));
    assert.deepEqual(await estante(ana, living, 0), ["C", "A", "X", "B"]);

    // A baja al estante 2, al final (un índice de más cae al final).
    ok(await placeItem(ids.A, living, 1, 99));
    assert.deepEqual(await estante(ana, living, 0), ["C", "X", "B"]);
    assert.deepEqual(await estante(ana, living, 1), ["A"]);
  });

  it("reordenar una parte respeta el lugar de lo que no se ve", async () => {
    const ids: Record<string, string> = {};
    for (const n of ["A", "B", "C", "D", "E"]) ids[n] = await nuevo(n);
    const caja = ok(await createShelf({ name: "Caja", kind: "box" })).id;
    ok(await moveItem(ids.B, caja));
    ok(await moveItem(ids.D, caja));
    assert.deepEqual(await estante(ana, null), ["E", "C", "A"]);

    ok(await reorderItems([ids.A, ids.E, ids.C]));
    assert.deepEqual(await estante(ana, null), ["A", "E", "C"]);
    assert.deepEqual(await estante(ana, caja), ["D", "B"]);
  });

  it("reordenar rechaza ids repetidos", async () => {
    const id = await nuevo("A");
    assert.equal((await reorderItems([id, id])).ok, false);
  });

  it("menos estantes: lo de los que desaparecen baja al último", async () => {
    const living = ok(await createShelf({ name: "Living", levels: 4 })).id;
    await nuevo("Arriba", { shelfId: living, level: 0 });
    await nuevo("Abajo", { shelfId: living, level: 3 });
    ok(await updateShelf(living, { name: "Living", kind: "shelf", levels: 2 }));
    assert.deepEqual(await estante(ana, living, 1), ["Abajo"]);
    assert.deepEqual(await estante(ana, living, 0), ["Arriba"]);
  });

  it("borrar un contenedor deja sus objetos sin ubicar, en el nivel 0", async () => {
    const mueble = ok(await createShelf({ name: "Mueble", kind: "cabinet", levels: 3 })).id;
    const id = await nuevo("Matrix", { shelfId: mueble, level: 2 });
    ok(await deleteShelf(mueble));
    const [item] = await listItems(ana);
    assert.equal(item.id, id);
    assert.equal(item.shelfId, null);
    assert.equal(item.level, 0);
    const data = await listShelves(ana);
    assert.equal(data.shelves.length, 0);
    assert.equal(data.unshelved, 1);
  });

  it("no deja dos contenedores con el mismo nombre", async () => {
    ok(await createShelf({ name: "Living" }));
    assert.equal((await createShelf({ name: "Living", kind: "box" })).ok, false);
    sesionComo(beto);
    ok(await createShelf({ name: "Living" }));
  });
});

describe("contador de inventario", { skip: sinBase }, () => {
  it("el contador del usuario queda en el último número entregado", async () => {
    await limpiar();
    const ana = await crearUsuario("ana@example.com");
    sesionComo(ana);
    await nuevo("A");
    await nuevo("B");
    // El contador quedó en 2: lo que se cree después sigue desde ahí.
    const [{ seq }] = (await db.execute(sql`select inventory_seq as seq from users where id = ${ana}`)) as unknown as { seq: number }[];
    assert.equal(seq, 2);
    sesionComo(null);
  });
});
