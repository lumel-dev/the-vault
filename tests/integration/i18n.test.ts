import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { crearUsuario, db, limpiar, sesionComo, sinBase } from "./base";

const { completeTranslations, createItem, updateItem, deleteItem } = await import("@/lib/actions/items");
const { setLocaleAction } = await import("@/lib/actions/auth");
const { listItems } = await import("@/lib/queries");
const { users, items } = await import("@/lib/db/schema");
const { eq } = await import("drizzle-orm");

/** TMDB simulado: la misma película en cada idioma. */
function fakeTmdb() {
  globalThis.fetch = (async (url: URL) => {
    const es = url.searchParams.get("language") === "es-MX";
    return Response.json({
      title: es ? "Tiempos violentos" : "Pulp Fiction",
      overview: es ? "Sinopsis" : "Synopsis",
      genres: [{ name: es ? "Crimen" : "Crime" }],
      poster_path: es ? "/es.jpg" : "/en.jpg",
    });
  }) as unknown as typeof fetch;
}

describe("bilingüe", { skip: sinBase }, () => {
  const realFetch = globalThis.fetch;
  let ana: string;

  beforeEach(async () => {
    await limpiar();
    ana = await crearUsuario("ana@example.com");
    sesionComo(ana);
    process.env.TMDB_API_TOKEN = "t";
    fakeTmdb();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.TMDB_API_TOKEN;
  });

  after(() => sesionComo(null));

  const pulp = {
    type: "movie",
    name: "Tiempos violentos",
    description: "Sinopsis",
    attributes: { format: "DVD", genre: "Crimen" },
    coverSource: "tmdb",
    coverRef: "/es.jpg",
    externalSource: "tmdb" as const,
    externalId: "movie:680",
  };

  it("al guardar algo de TMDB se guardan los dos idiomas", async () => {
    const res = await createItem(pulp);
    assert.ok(res.ok);
    const [item] = await listItems(ana);
    assert.equal(item.translations.en?.name, "Pulp Fiction");
    assert.equal(item.translations.en?.coverRef, "/en.jpg");
    assert.equal(item.translations.es?.name, "Tiempos violentos");
  });

  it("editar en inglés cambia el inglés y deja el castellano", async () => {
    const res = await createItem(pulp);
    assert.ok(res.ok);
    await setLocaleAction("en");
    const edit = await updateItem(res.data.id, { ...pulp, name: "Pulp Fiction (Collector's)", description: "Synopsis", attributes: { format: "DVD", genre: "Crime" }, coverRef: "/en.jpg" });
    assert.ok(edit.ok);
    const [item] = await listItems(ana);
    assert.equal(item.translations.en?.name, "Pulp Fiction (Collector's)");
    assert.equal(item.translations.es?.name, "Tiempos violentos");
  });

  it("lo cargado antes se completa en los dos idiomas", async () => {
    await db.insert(items).values({ userId: ana, type: "movie", name: "Tiempos violentos", externalSource: "tmdb", externalId: "movie:680", coverSource: "tmdb", coverRef: "/es.jpg", inventoryNumber: 99 });
    const res = await completeTranslations();
    assert.ok(res.ok);
    assert.deepEqual(res.data, { done: 1, remaining: 0 });
    const [item] = await listItems(ana);
    assert.equal(item.translations.en?.name, "Pulp Fiction");
  });

  it("si TMDB no responde, se guarda igual", async () => {
    globalThis.fetch = (async () => new Response("caído", { status: 503 })) as unknown as typeof fetch;
    const res = await createItem(pulp);
    assert.ok(res.ok);
    const [item] = await listItems(ana);
    assert.equal(item.name, "Tiempos violentos");
  });

  it("los errores vuelven en el idioma del usuario", async () => {
    await setLocaleAction("en");
    const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, ana));
    assert.equal(u.locale, "en");
    const res = await deleteItem("00000000-0000-0000-0000-000000000000");
    assert.deepEqual(res, { ok: false, error: "That item doesn't exist" });
    const bad = await createItem({ type: "movie", name: "  " });
    assert.deepEqual(bad, { ok: false, error: "The name is missing" });
  });

  it("un idioma que no existe no se guarda", async () => {
    await setLocaleAction("fr");
    const [u] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, ana));
    assert.equal(u.locale, "es");
  });
});
