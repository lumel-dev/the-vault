"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { isValidCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { items, shelves, users, type ItemTranslations } from "@/lib/db/schema";
import { messages, type Messages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { cleanAttributes, isItemType } from "@/lib/item-types";
import { tmdbEnabled, tmdbTranslations } from "@/lib/tmdb";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** El usuario de la sesión, su idioma y sus textos: los errores vuelven en su idioma. */
async function session() {
  const userId = await requireUserId();
  const locale = await getUserLocale(userId);
  return { userId, locale, t: messages[locale] };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const itemSchema = z.object({
  type: z.string().refine(isItemType),
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  brand: optionalText(120),
  model: optionalText(120),
  shelfId: z.uuid().nullish().transform((v) => v ?? null),
  level: z.number().int().min(0).max(20).default(0),
  attributes: z.record(z.string(), z.unknown()).default({}),
  coverSource: z.string().nullish(),
  coverRef: z.string().nullish(),
  externalSource: z.enum(["tmdb", "openlibrary", "musicbrainz"]).nullish(),
  externalId: z.string().max(80).nullish(),
});

/** Cómo es el id de cada catálogo: "movie:603", "work:OL14860424W", "release-group:<mbid>". */
const EXTERNAL_ID: Record<string, RegExp> = {
  tmdb: /^(movie|tv):\d{1,10}$/,
  openlibrary: /^work:OL\d{1,12}W$/,
  musicbrainz: /^release-group:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
};

export type ItemInput = z.input<typeof itemSchema>;

function firstError(error: z.ZodError, t: Messages): string {
  const field = error.issues[0]?.path[0];
  if (field === "name") return t.errors.nameMissing;
  if (field === "type") return t.errors.badType;
  return t.errors.invalid;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * El contenedor tiene que ser del mismo usuario: un uuid ajeno no sirve para guardar cosas ahí.
 * Devuelve el estante válido dentro del contenedor (sin contenedor, siempre el 0).
 */
async function resolveLevel(userId: string, shelfId: string | null, level: number, t: Messages, conn: Tx | typeof db = db): Promise<number> {
  if (!shelfId) return 0;
  const [row] = await conn
    .select({ levels: shelves.levels })
    .from(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.userId, userId)))
    .limit(1);
  if (!row) throw new Error(t.errors.containerMissing);
  return Math.min(Math.max(0, level), row.levels - 1);
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

async function guard<T>(t: Messages, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : t.errors.unexpected };
  }
}

export async function createItem(input: ItemInput): Promise<ActionResult<{ id: string; inventoryNumber: number }>> {
  const { userId, locale, t } = await session();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error, t) };
  return guard(t, async () => {
    const values = toValues(parsed.data);
    // TMDB se consulta antes de abrir la transacción: no tiene sentido tenerla abierta esperando la red.
    const translations = await buildTranslations(values, locale, null);
    const row = await db.transaction(async (tx) => {
      const level = await resolveLevel(userId, parsed.data.shelfId, parsed.data.level, t, tx);
      // El número sale de un contador del usuario, no de max()+1: borrar el último no lo libera.
      const [seq] = await tx
        .update(users)
        .set({ inventorySeq: sql`${users.inventorySeq} + 1` })
        .where(eq(users.id, userId))
        .returning({ n: users.inventorySeq });
      if (!seq) throw new Error(t.errors.unauthenticated);
      const [created] = await tx
        .insert(items)
        .values({ ...values, translations, level, userId, position: topPosition(userId), inventoryNumber: seq.n })
        .returning({ id: items.id, inventoryNumber: items.inventoryNumber });
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
      .select({ externalId: items.externalId, attributes: items.attributes, translations: items.translations })
      .from(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .limit(1);
    if (!current) throw new Error(t.errors.itemMissing);
    const values = toValues(parsed.data);
    const translations = await buildTranslations(values, locale, {
      externalId: current.externalId,
      season: current.attributes.season,
      translations: current.translations,
    });
    const level = await resolveLevel(userId, parsed.data.shelfId, parsed.data.level, t);
    const updated = await db
      .update(items)
      .set({ ...values, translations, level, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!updated.length) throw new Error(t.errors.itemMissing);
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
    if (!deleted.length) throw new Error(t.errors.itemMissing);
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

/** Arrastrar un objeto a un contenedor (o a "Sin ubicar"): queda primero en su estante de arriba. */
export async function moveItem(id: string, shelfId: string | null): Promise<ActionResult> {
  return placeItem(id, shelfId, 0, 0);
}

/**
 * Soltar un objeto en un lugar concreto: contenedor, estante (`level`) y posición dentro del
 * estante contada desde la izquierda (`index`). Es lo que hace la vista 3D al soltar un lomo.
 *
 * El orden se guarda con el mismo criterio que `reorderItems`: se toman las posiciones que ya
 * ocupaban los objetos de ese estante (más la del que llega) y se reparten en el orden nuevo.
 */
export async function placeItem(id: string, shelfId: string | null, level: number, index: number): Promise<ActionResult> {
  const { userId, t } = await session();
  const args = z
    .object({ id: z.uuid(), shelfId: z.uuid().nullable(), level: z.number().int().min(0).max(20), index: z.number().int().min(0).max(5000) })
    .safeParse({ id, shelfId, level, index });
  if (!args.success) return { ok: false, error: t.errors.badPlace };
  return guard(t, async () => {
    await db.transaction(async (tx) => {
      const target = await resolveLevel(userId, args.data.shelfId, args.data.level, t, tx);
      const [moving] = await tx
        .select({ id: items.id, position: items.position })
        .from(items)
        .where(and(eq(items.id, args.data.id), eq(items.userId, userId)))
        .for("update");
      if (!moving) throw new Error(t.errors.itemMissing);

      const neighbours = await tx
        .select({ id: items.id, position: items.position })
        .from(items)
        .where(
          and(
            eq(items.userId, userId),
            args.data.shelfId ? eq(items.shelfId, args.data.shelfId) : isNull(items.shelfId),
            eq(items.level, target),
            ne(items.id, moving.id),
          ),
        )
        .orderBy(asc(items.position), asc(items.createdAt))
        .for("update");

      const order = neighbours.map((n) => n.id);
      order.splice(Math.min(args.data.index, order.length), 0, moving.id);
      const slots = [...neighbours.map((n) => n.position), moving.position].sort((a, b) => a - b);
      for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;

      const current = new Map([...neighbours, moving].map((r) => [r.id, r.position]));
      for (const [i, itemId] of order.entries()) {
        if (itemId === moving.id) {
          await tx
            .update(items)
            .set({ shelfId: args.data.shelfId, level: target, position: slots[i], updatedAt: new Date() })
            .where(eq(items.id, itemId));
        } else if (current.get(itemId) !== slots[i]) {
          await tx.update(items).set({ position: slots[i] }).where(eq(items.id, itemId));
        }
      }
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
      if (rows.length !== ids.data.length) throw new Error(t.errors.itemsMissing);
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
