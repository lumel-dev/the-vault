import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { crearUsuario, limpiar, sesionComo, sinBase } from "./base";

const { createItem, deleteItem, moveItem, reorderItems, updateItem } = await import("@/lib/actions/items");
const { createShelf, deleteShelf } = await import("@/lib/actions/shelves");
const { listItems, listShelves } = await import("@/lib/queries");

function ok<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) assert.fail(res.error);
  return res.data;
}

async function nuevo(name: string, extra: Record<string, unknown> = {}) {
  return ok(await createItem({ type: "movie", name, attributes: { format: "DVD" }, ...extra })).id;
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

  it("lo nuevo queda primero", async () => {
    await nuevo("Uno");
    await nuevo("Dos");
    const names = (await listItems(ana)).map((i) => i.name);
    assert.deepEqual(names, ["Dos", "Uno"]);
  });

  it("guarda sólo atributos válidos y descarta tapas que no son de TMDB", async () => {
    const id = ok(
      await createItem({
        type: "series",
        name: "Lost",
        attributes: { season: "2", format: "DVD", director: "no aplica" },
        coverSource: "tmdb",
        coverRef: "https://evil.example/x.jpg",
      }),
    ).id;
    const [item] = await listItems(ana);
    assert.equal(item.id, id);
    assert.deepEqual(item.attributes, { season: "2", format: "DVD" });
    assert.equal(item.coverRef, null);
  });

  it("cada usuario ve y toca sólo lo suyo", async () => {
    const id = await nuevo("De Ana");
    sesionComo(beto);
    assert.equal((await listItems(beto)).length, 0);
    assert.equal((await deleteItem(id)).ok, false);
    assert.equal((await updateItem(id, { type: "movie", name: "Robada" })).ok, false);
    assert.equal((await moveItem(id, null)).ok, false);
    assert.equal((await reorderItems([id])).ok, false);

    // Tampoco puede guardar algo en un estante ajeno.
    sesionComo(ana);
    const estante = ok(await createShelf("Living")).id;
    sesionComo(beto);
    const res = await createItem({ type: "movie", name: "X", shelfId: estante });
    assert.equal(res.ok, false);
  });

  it("sin sesión, las acciones se niegan", async () => {
    sesionComo(null);
    await assert.rejects(createItem({ type: "movie", name: "X" }), /No autenticado/);
  });

  it("reordenar una parte respeta el lugar de lo que no se ve", async () => {
    // Orden inicial (lo último creado primero): E D C B A.
    const ids: Record<string, string> = {};
    for (const n of ["A", "B", "C", "D", "E"]) ids[n] = await nuevo(n);
    const estante = ok(await createShelf("Caja")).id;
    // B y D van a la caja: quedan primeros en el orden global (D, B, E, C, A).
    ok(await moveItem(ids.B, estante));
    ok(await moveItem(ids.D, estante));
    assert.deepEqual((await listItems(ana)).map((i) => i.name), ["D", "B", "E", "C", "A"]);

    // Viendo sólo "Sin ubicar" (E C A), se arrastra A al principio: A E C.
    ok(await reorderItems([ids.A, ids.E, ids.C]));
    assert.deepEqual((await listItems(ana, { shelf: "none" })).map((i) => i.name), ["A", "E", "C"]);
    // Lo de la caja no se movió de su lugar.
    assert.deepEqual((await listItems(ana)).map((i) => i.name), ["D", "B", "A", "E", "C"]);
    assert.deepEqual((await listItems(ana, { shelf: estante })).map((i) => i.name), ["D", "B"]);
  });

  it("reordenar rechaza ids repetidos", async () => {
    const id = await nuevo("A");
    assert.equal((await reorderItems([id, id])).ok, false);
  });

  it("borrar un estante deja sus objetos sin ubicar", async () => {
    const estante = ok(await createShelf("Mueble")).id;
    const id = await nuevo("Matrix", { shelfId: estante });
    ok(await deleteShelf(estante));
    const [item] = await listItems(ana, { shelf: "none" });
    assert.equal(item.id, id);
    const data = await listShelves(ana);
    assert.equal(data.shelves.length, 0);
    assert.equal(data.unshelved, 1);
  });

  it("no deja dos estantes con el mismo nombre", async () => {
    ok(await createShelf("Living"));
    const res = await createShelf("Living");
    assert.equal(res.ok, false);
    // Otro usuario sí puede tener su "Living".
    sesionComo(beto);
    ok(await createShelf("Living"));
  });
});

describe("búsqueda", { skip: sinBase }, () => {
  let ana: string;

  beforeEach(async () => {
    await limpiar();
    ana = await crearUsuario("ana@example.com");
    sesionComo(ana);
    await createItem({ type: "movie", name: "Matrix", attributes: { director: "Lana Wachowski", year: "1999" } });
    await createItem({ type: "series", name: "La casa de papel", attributes: { season: "2" } });
    await createItem({ type: "movie", name: "Acción mutante" });
    await createItem({ type: "other", name: "Consola", brand: "Sony", model: "PlayStation 2" });
  });

  const buscar = async (q: string, type?: string) => (await listItems(ana, { q, type })).map((i) => i.name);

  it("sin importar mayúsculas ni acentos", async () => {
    assert.deepEqual(await buscar("ACCION"), ["Acción mutante"]);
  });

  it("tolera un error de tipeo", async () => {
    assert.deepEqual(await buscar("matirx"), ["Matrix"]);
  });

  it("encuentra por atributos, marca y modelo", async () => {
    assert.deepEqual(await buscar("wachowski"), ["Matrix"]);
    assert.deepEqual(await buscar("sony playstation"), ["Consola"]);
  });

  it("todas las palabras tienen que estar", async () => {
    assert.deepEqual(await buscar("casa papel"), ["La casa de papel"]);
    assert.deepEqual(await buscar("casa matrix"), []);
  });

  it("un % se busca literal", async () => {
    assert.deepEqual(await buscar("%"), []);
  });

  it("se combina con el filtro de tipo", async () => {
    assert.deepEqual(await buscar("a", "series"), ["La casa de papel"]);
  });
});
