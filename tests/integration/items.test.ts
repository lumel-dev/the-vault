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

/** Los nombres de lo que hay en un contenedor, en orden (estante de arriba, de izquierda a derecha). */
async function estante(userId: string, shelfId: string | null) {
  return (await listItems(userId)).filter((i) => i.shelfId === shelfId).map((i) => i.name);
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

  it("lo que llega a un mueble va al final; a sin ubicar, primero", async () => {
    const living = ok(await createShelf({ name: "Living" })).id;
    await nuevo("Primero", { shelfId: living });
    await nuevo("Segundo", { shelfId: living });
    const suelto = await nuevo("Suelto");
    ok(await moveItem(suelto, living));
    assert.deepEqual(await estante(ana, living), ["Primero", "Segundo", "Suelto"]);

    // Editarlo cambiándole el lugar es lo mismo que moverlo.
    const otro = await nuevo("Otro");
    ok(await updateItem(otro, { type: "movie", name: "Otro", shelfId: living }));
    assert.deepEqual(await estante(ana, living), ["Primero", "Segundo", "Suelto", "Otro"]);
    ok(await updateItem(otro, { type: "movie", name: "Otro", shelfId: null }));
    await nuevo("Más nuevo");
    assert.deepEqual(await estante(ana, null), ["Más nuevo", "Otro"]);
  });

  it("cada usuario ve y toca sólo lo suyo", async () => {
    const id = await nuevo("De Ana");
    sesionComo(beto);
    assert.equal((await listItems(beto)).length, 0);
    assert.equal((await deleteItem(id)).ok, false);
    assert.equal((await updateItem(id, { type: "movie", name: "Robada" })).ok, false);
    assert.equal((await moveItem(id, null)).ok, false);
    assert.equal((await placeItem(id, null, 0)).ok, false);
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

  it("una temporada nueva va al lado de las otras de la misma serie", async () => {
    const living = ok(await createShelf({ name: "Living" })).id;
    const friends = (season: string) => ({ shelfId: living, type: "series", attributes: { season, format: "DVD" }, externalSource: "tmdb" as const, externalId: "tv:1668" });
    await nuevo("Friends", friends("1"));
    await nuevo("Matrix", { shelfId: living });
    // La T3 ya se pone al lado de la T1, antes de Matrix.
    await nuevo("Friends", friends("3"));
    await nuevo("Lost", { shelfId: living });

    await nuevo("Friends", friends("2"));
    const orden = (await listItems(ana)).filter((i) => i.shelfId === living).map((i) => `${i.name}${i.attributes.season ?? ""}`);
    assert.deepEqual(orden, ["Friends1", "Friends2", "Friends3", "Matrix", "Lost"]);

    // Lo mismo si se la cambia de lugar editándola.
    const suelta = await nuevo("Friends", { ...friends("4"), shelfId: null });
    ok(await updateItem(suelta, { name: "Friends", ...friends("4") }));
    const despues = (await listItems(ana)).filter((i) => i.shelfId === living).map((i) => `${i.name}${i.attributes.season ?? ""}`);
    assert.deepEqual(despues, ["Friends1", "Friends2", "Friends3", "Friends4", "Matrix", "Lost"]);
  });

  it("soltar en un lugar concreto de un mueble", async () => {
    const living = ok(await createShelf({ name: "Living" })).id;
    const ids: Record<string, string> = {};
    for (const n of ["A", "B", "C"]) ids[n] = await nuevo(n, { shelfId: living });
    ids.X = await nuevo("X");

    // X, que estaba sin ubicar, va entre A y B.
    ok(await placeItem(ids.X, living, 1));
    assert.deepEqual(await estante(ana, living), ["A", "X", "B", "C"]);
    assert.deepEqual(await estante(ana, null), []);

    // C pasa al principio.
    ok(await placeItem(ids.C, living, 0));
    assert.deepEqual(await estante(ana, living), ["C", "A", "X", "B"]);

    // Un lugar de más cae al final.
    ok(await placeItem(ids.C, living, 99));
    assert.deepEqual(await estante(ana, living), ["A", "X", "B", "C"]);
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
    assert.deepEqual(await estante(ana, caja), ["B", "D"]);
  });

  it("reordenar rechaza ids repetidos", async () => {
    const id = await nuevo("A");
    assert.equal((await reorderItems([id, id])).ok, false);
  });

  it("borrar un contenedor deja sus objetos sin ubicar", async () => {
    const mueble = ok(await createShelf({ name: "Mueble", kind: "cabinet" })).id;
    const id = await nuevo("Matrix", { shelfId: mueble });
    ok(await deleteShelf(mueble));
    const [item] = await listItems(ana);
    assert.equal(item.id, id);
    assert.equal(item.shelfId, null);
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
