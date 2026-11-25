"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserError, type ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth/session";
import { isValidCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { items, shelves, stickers, users, type ItemTranslations } from "@/lib/db/schema";
import { messages, type Messages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { cleanAttributes } from "@/lib/item-types";
import { ensureStickers } from "@/lib/queries";
import { clientId, EXTERNAL_ID, itemSchema, type ItemInput } from "@/lib/schemas";
import { siblingIndex } from "@/lib/siblings";
import { tmdbEnabled, tmdbTranslations } from "@/lib/tmdb";

export type { ActionResult } from "@/lib/action-result";
export type { ItemInput } from "@/lib/schemas";

/** El usuario de la sesión, su idioma y sus textos: los errores vuelven en su idioma. */
async function session() {
  const userId = await requireUserId();
  const locale = await getUserLocale(userId);
  return { userId, locale, t: messages[locale] };
}

function firstError(error: z.ZodError, t: Messages): string {
  const field = error.issues[0]?.path[0];
  if (field === "name") return t.errors.nameMissing;
  if (field === "type") return t.errors.badType;
  return t.errors.invalid;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * El sticker del objeto, que tiene que ser del mismo usuario. Sin sticker (o con uno que ya no
 * existe) se usa el primero del tipo pedido; si el usuario no tiene ninguno de ese tipo, falla.
 */
async function resolveSticker(userId: string, stickerId: string | null | undefined, type: string, t: Messages): Promise<{ id: string; base: string }> {
  if (stickerId) {
    const [own] = await db
      .select({ id: stickers.id, base: stickers.base })
      .from(stickers)
      .where(and(eq(stickers.id, stickerId), eq(stickers.userId, userId)))
      .limit(1);
    if (!own) throw new UserError(t.errors.stickerMissing);
    return own;
  }
  await ensureStickers(userId);
  const [first] = await db
    .select({ id: stickers.id, base: stickers.base })
    .from(stickers)
    .where(and(eq(stickers.userId, userId), eq(stickers.base, type)))
    .orderBy(asc(stickers.position), asc(stickers.createdAt))
    .limit(1);
  if (!first) throw new UserError(t.errors.stickerMissing);
  return first;
}

/** El contenedor tiene que ser del mismo usuario: un uuid ajeno no sirve para guardar cosas ahí. */
async function checkContainer(userId: string, shelfId: string | null, t: Messages, conn: Tx | typeof db = db): Promise<void> {
  if (!shelfId) return;
  const [row] = await conn
    .select({ id: shelves.id })
    .from(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.userId, userId)))
    .limit(1);
  if (!row) throw new UserError(t.errors.containerMissing);
}

function toValues(data: z.output<typeof itemSchema>) {
  const coverOk = isValidCover(data.coverSource, data.coverRef);
  const externalOk = Boolean(data.externalSource && data.externalId && EXTERNAL_ID[data.externalSource]?.test(data.externalId));
  return {
    type: data.type,
    name: data.name,
    description: data.description,
    brand: data.brand,
    model: data.model,
    shelfId: data.shelfId,
    attributes: cleanAttributes(data.type, data.attributes),
    coverSource: coverOk ? data.coverSource! : null,
    coverRef: coverOk ? data.coverRef! : null,
    externalSource: externalOk ? data.externalSource! : null,
    externalId: externalOk ? data.externalId! : null,
  };
}

/**
 * Las traducciones de un objeto al guardarlo. Si viene de TMDB se piden los dos idiomas (si TMDB
 * no responde se guarda igual, sin traducciones). Lo que se cargó en el formulario es la versión
 * del idioma del usuario y pisa la de TMDB: si alguien corrige un título, se ve corregido.
 */
async function buildTranslations(
  values: ReturnType<typeof toValues>,
  locale: keyof ItemTranslations,
  previous: { externalId: string | null; season: string | undefined; translations: ItemTranslations } | null,
): Promise<ItemTranslations> {
  let base: ItemTranslations = {};
  const sameTitle = previous && previous.externalId === values.externalId && previous.season === values.attributes.season;
  if (sameTitle) base = previous.translations;
  else if (values.externalSource === "tmdb" && values.externalId && tmdbEnabled()) {
    try {
      base = await tmdbTranslations(values.externalId, values.attributes.season);
    } catch (error) {
      console.error("[tmdb] traducciones", error);
    }
  }
  if (!values.externalSource) return {};
  return {
    ...base,
    [locale]: {
      ...base[locale],
      name: values.name,
      description: values.description,
      genre: values.attributes.genre ?? null,
      coverRef: values.coverSource === "tmdb" ? values.coverRef : (base[locale]?.coverRef ?? null),
    },
  };
}

/** La posición para que algo quede primero: una menos que la más chica del usuario. */
function topPosition(userId: string) {
  return sql<number>`(select coalesce(min(${items.position}), 0) - 1 from ${items} where ${items.userId} = ${userId})`;
}

function bottomPosition(userId: string) {
  return sql<number>`(select coalesce(max(${items.position}), 0) + 1 from ${items} where ${items.userId} = ${userId})`;
}

/**
 * Dónde entra en el orden algo que llega a un lugar: sin ubicar, primero (es lo que se acaba de
 * cargar y está a mano); en un mueble, al final, que es el último estante con lugar (o uno nuevo).
 */
function arrivalPosition(userId: string, shelfId: string | null) {
  return shelfId ? bottomPosition(userId) : topPosition(userId);
}

/** Los `UserError` vuelven con su texto; cualquier otra falla es inesperada y se puede reintentar. */
async function guard<T>(t: Messages, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error("[items]", error);
    return { ok: false, error: t.errors.unexpected, retry: true };
  }
}

/**
 * Carga un objeto. `id` lo genera el browser (la cola de cambios, `src/lib/offline/`): si ya
 * existe, es un reenvío y se devuelve el que había, sin gastar otro número de inventario.
 */
export async function createItem(input: ItemInput, id?: string): Promise<ActionResult<{ id: string; inventoryNumber: number }>> {
  const { userId, locale, t } = await session();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error, t) };
  if (id !== undefined && !clientId.safeParse(id).success) return { ok: false, error: t.errors.invalid };
  return guard(t, async () => {
    if (id) {
      const [existing] = await db
        .select({ id: items.id, inventoryNumber: items.inventoryNumber, userId: items.userId })
        .from(items)
        .where(eq(items.id, id))
        .limit(1);
      if (existing?.userId === userId) return { id: existing.id, inventoryNumber: existing.inventoryNumber };
      if (existing) throw new UserError(t.errors.invalid);
    }
    const sticker = await resolveSticker(userId, parsed.data.stickerId, parsed.data.type, t);
    const values = { ...toValues({ ...parsed.data, type: sticker.base as typeof parsed.data.type }), stickerId: sticker.id };
    // TMDB se consulta antes de abrir la transacción: no tiene sentido tenerla abierta esperando la red.
    const translations = await buildTranslations(values, locale, null);
    const row = await db.transaction(async (tx) => {
      await checkContainer(userId, parsed.data.shelfId, t, tx);
      // El número sale de un contador del usuario, no de max()+1: borrar el último no lo libera.
      const [seq] = await tx
        .update(users)
        .set({ inventorySeq: sql`${users.inventorySeq} + 1` })
        .where(eq(users.id, userId))
        .returning({ n: users.inventorySeq });
      if (!seq) throw new UserError(t.errors.unauthenticated);
      const [created] = await tx
        .insert(items)
        .values({ ...values, ...(id ? { id } : {}), translations, level: 0, userId, position: arrivalPosition(userId, parsed.data.shelfId), inventoryNumber: seq.n })
        .returning({ id: items.id, inventoryNumber: items.inventoryNumber });
      await besideSiblings(tx, userId, created.id, parsed.data.shelfId, values.externalId, values.attributes.season, t);
      return created;
    });
    revalidatePath("/");
    return row;
  });
}

export async function updateItem(id: string, input: ItemInput): Promise<ActionResult> {
  const { userId, locale, t } = await session();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error, t) };
  return guard(t, async () => {
    const [current] = await db
      .select({ externalId: items.externalId, attributes: items.attributes, translations: items.translations, shelfId: items.shelfId })
      .from(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .limit(1);
    if (!current) throw new UserError(t.errors.itemMissing);
    const sticker = await resolveSticker(userId, parsed.data.stickerId, parsed.data.type, t);
    const values = { ...toValues({ ...parsed.data, type: sticker.base as typeof parsed.data.type }), stickerId: sticker.id };
    const translations = await buildTranslations(values, locale, {
      externalId: current.externalId,
      season: current.attributes.season,
      translations: current.translations,
    });
    await checkContainer(userId, parsed.data.shelfId, t);
    // Si cambió de lugar, llega como cualquier cosa que llega ahí; si no, conserva su lugar.
    const moved = current.shelfId !== parsed.data.shelfId;
    const updated = await db
      .update(items)
      .set({ ...values, translations, level: 0, ...(moved ? { position: arrivalPosition(userId, parsed.data.shelfId) } : {}), updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!updated.length) throw new UserError(t.errors.itemMissing);
    if (moved) await db.transaction((tx) => besideSiblings(tx, userId, id, parsed.data.shelfId, values.externalId, values.attributes.season, t));
    revalidatePath("/");
    return undefined;
  });
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const { userId, t } = await session();
  return guard(t, async () => {
    const deleted = await db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!deleted.length) throw new UserError(t.errors.itemMissing);
    revalidatePath("/");
    return undefined;
  });
}

/**
 * Completa en los dos idiomas lo que se cargó desde TMDB antes de que la app fuera bilingüe (o
 * cuando TMDB no respondió). Va de a poco, para no tener al usuario esperando: la app la llama al
 * abrir y la vuelve a llamar mientras `remaining` sea mayor que cero.
 */
export async function completeTranslations(): Promise<ActionResult<{ done: number; remaining: number }>> {
  const { userId, t } = await session();
  if (!tmdbEnabled()) return { ok: true, data: { done: 0, remaining: 0 } };
  return guard(t, async () => {
    const pending = and(eq(items.userId, userId), eq(items.externalSource, "tmdb"), sql`${items.translations} = '{}'::jsonb`);
    const batch = await db
      .select({ id: items.id, externalId: items.externalId, attributes: items.attributes })
      .from(items)
      .where(pending)
      .limit(12);
    let done = 0;
    for (const row of batch) {
      let translations: ItemTranslations = {};
      try {
        translations = await tmdbTranslations(row.externalId!, row.attributes.season);
      } catch (error) {
        console.error("[tmdb] completar traducciones", error);
      }
      // Si TMDB no devolvió nada, se marca igual (con un idioma vacío) para no reintentar en loop.
      await db
        .update(items)
        .set({ translations: Object.keys(translations).length ? translations : { es: {} } })
        .where(eq(items.id, row.id));
      done++;
    }
    const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(items).where(pending);
    if (done) revalidatePath("/");
    return { done, remaining: left?.n ?? 0 };
  });
}

/**
 * El lugar dentro de un contenedor, dentro de una transacción: `pickIndex` recibe lo que ya hay
 * (en orden, sin el que se mueve) y dice dónde va. Se reparten las posiciones que ya ocupaban.
 */
async function placeInTx(
  tx: Tx,
  userId: string,
  id: string,
  shelfId: string | null,
  pickIndex: (contents: { id: string; externalId: string | null; attributes: Record<string, string> }[]) => number,
  t: Messages,
): Promise<void> {
  const [moving] = await tx
    .select({ id: items.id, position: items.position })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .for("update");
  if (!moving) throw new UserError(t.errors.itemMissing);

  const neighbours = await tx
    .select({ id: items.id, position: items.position, externalId: items.externalId, attributes: items.attributes })
    .from(items)
    .where(and(eq(items.userId, userId), shelfId ? eq(items.shelfId, shelfId) : isNull(items.shelfId), ne(items.id, moving.id)))
    .orderBy(asc(items.position), asc(items.createdAt))
    .for("update");

  const order = neighbours.map((n) => n.id);
  order.splice(Math.min(pickIndex(neighbours), order.length), 0, moving.id);
  const slots = [...neighbours.map((n) => n.position), moving.position].sort((a, b) => a - b);
  for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;

  const current = new Map([...neighbours, moving].map((r) => [r.id, r.position]));
  for (const [i, itemId] of order.entries()) {
    if (itemId === moving.id) {
      await tx.update(items).set({ shelfId, level: 0, position: slots[i], updatedAt: new Date() }).where(eq(items.id, itemId));
    } else if (current.get(itemId) !== slots[i]) {
      await tx.update(items).set({ position: slots[i] }).where(eq(items.id, itemId));
    }
  }
}

/** Si en el mueble ya están sus hermanas (otras temporadas), lo pone al lado; si no, no toca nada. */
async function besideSiblings(tx: Tx, userId: string, id: string, shelfId: string | null, externalId: string | null | undefined, season: string | undefined, t: Messages) {
  if (!shelfId || !externalId) return;
  await placeInTx(tx, userId, id, shelfId, (contents) => siblingIndex(contents, externalId, season) ?? contents.length, t);
}

/**
 * Arrastrar un objeto a un contenedor (o a "Sin ubicar"): a un mueble llega al final, que es el
 * último estante con lugar; a "Sin ubicar", primero.
 */
export async function moveItem(id: string, shelfId: string | null): Promise<ActionResult> {
  return placeItem(id, shelfId, shelfId ? MAX_INDEX : 0);
}

const MAX_INDEX = 5000;

/**
 * Soltar un objeto en un lugar concreto: contenedor y lugar dentro de lo que tiene, contado en
 * orden (estante de arriba de izquierda a derecha, después el siguiente). El estante no se guarda:
 * sale de ese orden (`flowShelves`). Es lo que hace la vista 3D al soltar un lomo.
 *
 * El orden se guarda con el mismo criterio que `reorderItems`: se toman las posiciones que ya
 * ocupaban los objetos del contenedor (más la del que llega) y se reparten en el orden nuevo.
 */
export async function placeItem(id: string, shelfId: string | null, index: number): Promise<ActionResult> {
  const { userId, t } = await session();
  const args = z
    .object({ id: z.uuid(), shelfId: z.uuid().nullable(), index: z.number().int().min(0).max(MAX_INDEX) })
    .safeParse({ id, shelfId, index });
  if (!args.success) return { ok: false, error: t.errors.badPlace };
  return guard(t, async () => {
    await db.transaction(async (tx) => {
      await checkContainer(userId, args.data.shelfId, t, tx);
      await placeInTx(tx, userId, args.data.id, args.data.shelfId, () => args.data.index, t);
    });
    revalidatePath("/");
    return undefined;
  });
}

/**
 * Guarda el orden que quedó después de arrastrar. `orderedIds` son los objetos que se ven en
 * pantalla, que pueden ser sólo una parte de la colección (un estante, una búsqueda).
 *
 * Por eso no se numera de 0 a N: se toman las posiciones que **ya ocupaban** esos objetos y se
 * reparten en el orden nuevo. Lo que no se ve conserva su lugar y el orden relativo entre lo
 * visible y lo oculto no se rompe.
 */
export async function reorderItems(orderedIds: string[]): Promise<ActionResult> {
  const { userId, t } = await session();
  const ids = z.array(z.uuid()).max(5000).safeParse(orderedIds);
  if (!ids.success || new Set(ids.data).size !== ids.data.length) return { ok: false, error: t.errors.badOrder };
  if (!ids.data.length) return { ok: true, data: undefined };
  return guard(t, async () => {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: items.id, position: items.position })
        .from(items)
        .where(and(eq(items.userId, userId), inArray(items.id, ids.data)))
        .for("update");
      if (rows.length !== ids.data.length) throw new UserError(t.errors.itemsMissing);
      const slots = rows.map((r) => r.position).sort((a, b) => a - b);
      // Posiciones repetidas (dos objetos con el mismo número) se separan para que el orden nuevo
      // quede firme: cada slot es al menos uno más que el anterior.
      for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
      const current = new Map(rows.map((r) => [r.id, r.position]));
      for (const [i, id] of ids.data.entries()) {
        if (current.get(id) === slots[i]) continue;
        await tx.update(items).set({ position: slots[i] }).where(eq(items.id, id));
      }
    });
    revalidatePath("/");
    return undefined;
  });
}
