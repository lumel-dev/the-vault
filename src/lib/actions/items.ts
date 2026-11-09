"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { isValidCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { items, shelves, users } from "@/lib/db/schema";
import { cleanAttributes, isItemType } from "@/lib/item-types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const itemSchema = z.object({
  type: z.string().refine(isItemType, "Tipo desconocido"),
  name: z.string().trim().min(1, "Falta el nombre").max(200),
  description: optionalText(2000),
  brand: optionalText(120),
  model: optionalText(120),
  shelfId: z.uuid().nullish().transform((v) => v ?? null),
  level: z.number().int().min(0).max(20).default(0),
  attributes: z.record(z.string(), z.unknown()).default({}),
  coverSource: z.string().nullish(),
  coverRef: z.string().nullish(),
  externalSource: z.literal("tmdb").nullish(),
  externalId: z
    .string()
    .regex(/^(movie|tv):\d{1,10}$/)
    .nullish(),
});

export type ItemInput = z.input<typeof itemSchema>;

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * El contenedor tiene que ser del mismo usuario: un uuid ajeno no sirve para guardar cosas ahí.
 * Devuelve el estante válido dentro del contenedor (sin contenedor, siempre el 0).
 */
async function resolveLevel(userId: string, shelfId: string | null, level: number, conn: Tx | typeof db = db): Promise<number> {
  if (!shelfId) return 0;
  const [row] = await conn
    .select({ levels: shelves.levels })
    .from(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.userId, userId)))
    .limit(1);
  if (!row) throw new Error("El estante no existe");
  return Math.min(Math.max(0, level), row.levels - 1);
}

function toValues(data: z.output<typeof itemSchema>) {
  const coverOk = isValidCover(data.coverSource, data.coverRef);
  const externalOk = Boolean(data.externalSource && data.externalId);
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

/** La posición para que algo quede primero: una menos que la más chica del usuario. */
function topPosition(userId: string) {
  return sql<number>`(select coalesce(min(${items.position}), 0) - 1 from ${items} where ${items.userId} = ${userId})`;
}

async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error inesperado" };
  }
}

export async function createItem(input: ItemInput): Promise<ActionResult<{ id: string; inventoryNumber: number }>> {
  const userId = await requireUserId();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return guard(async () => {
    const row = await db.transaction(async (tx) => {
      const level = await resolveLevel(userId, parsed.data.shelfId, parsed.data.level, tx);
      // El número sale de un contador del usuario, no de max()+1: borrar el último no lo libera.
      const [seq] = await tx
        .update(users)
        .set({ inventorySeq: sql`${users.inventorySeq} + 1` })
        .where(eq(users.id, userId))
        .returning({ n: users.inventorySeq });
      if (!seq) throw new Error("No autenticado");
      const [created] = await tx
        .insert(items)
        .values({ ...toValues(parsed.data), level, userId, position: topPosition(userId), inventoryNumber: seq.n })
        .returning({ id: items.id, inventoryNumber: items.inventoryNumber });
      return created;
    });
    revalidatePath("/");
    return row;
  });
}

export async function updateItem(id: string, input: ItemInput): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return guard(async () => {
    const level = await resolveLevel(userId, parsed.data.shelfId, parsed.data.level);
    const updated = await db
      .update(items)
      .set({ ...toValues(parsed.data), level, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!updated.length) throw new Error("El objeto no existe");
    revalidatePath("/");
    return undefined;
  });
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  return guard(async () => {
    const deleted = await db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!deleted.length) throw new Error("El objeto no existe");
    revalidatePath("/");
    return undefined;
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
  const userId = await requireUserId();
  const args = z
    .object({ id: z.uuid(), shelfId: z.uuid().nullable(), level: z.number().int().min(0).max(20), index: z.number().int().min(0).max(5000) })
    .safeParse({ id, shelfId, level, index });
  if (!args.success) return { ok: false, error: "Lugar inválido" };
  return guard(async () => {
    await db.transaction(async (tx) => {
      const target = await resolveLevel(userId, args.data.shelfId, args.data.level, tx);
      const [moving] = await tx
        .select({ id: items.id, position: items.position })
        .from(items)
        .where(and(eq(items.id, args.data.id), eq(items.userId, userId)))
        .for("update");
      if (!moving) throw new Error("El objeto no existe");

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
  const userId = await requireUserId();
  const ids = z.array(z.uuid()).max(5000).safeParse(orderedIds);
  if (!ids.success || new Set(ids.data).size !== ids.data.length) return { ok: false, error: "Orden inválido" };
  if (!ids.data.length) return { ok: true, data: undefined };
  return guard(async () => {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: items.id, position: items.position })
        .from(items)
        .where(and(eq(items.userId, userId), inArray(items.id, ids.data)))
        .for("update");
      if (rows.length !== ids.data.length) throw new Error("Hay objetos que no existen");
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
