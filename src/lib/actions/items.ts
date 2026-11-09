"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { isValidCover } from "@/lib/covers";
import { db } from "@/lib/db";
import { items, shelves } from "@/lib/db/schema";
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

/** El estante tiene que ser del mismo usuario: un uuid ajeno no sirve para mover cosas ahí. */
async function assertShelf(userId: string, shelfId: string | null) {
  if (!shelfId) return;
  const [row] = await db
    .select({ id: shelves.id })
    .from(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.userId, userId)))
    .limit(1);
  if (!row) throw new Error("El estante no existe");
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

export async function createItem(input: ItemInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return guard(async () => {
    await assertShelf(userId, parsed.data.shelfId);
    const [row] = await db
      .insert(items)
      .values({ ...toValues(parsed.data), userId, position: topPosition(userId) })
      .returning({ id: items.id });
    revalidatePath("/");
    return { id: row.id };
  });
}

export async function updateItem(id: string, input: ItemInput): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return guard(async () => {
    await assertShelf(userId, parsed.data.shelfId);
    const updated = await db
      .update(items)
      .set({ ...toValues(parsed.data), updatedAt: new Date() })
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

/** Arrastrar un objeto a un estante (o a "Sin ubicar"). Queda primero en su nuevo lugar. */
export async function moveItem(id: string, shelfId: string | null): Promise<ActionResult> {
  const userId = await requireUserId();
  if (shelfId !== null && !z.uuid().safeParse(shelfId).success) return { ok: false, error: "Estante inválido" };
  return guard(async () => {
    await assertShelf(userId, shelfId);
    const moved = await db
      .update(items)
      .set({ shelfId, position: topPosition(userId), updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning({ id: items.id });
    if (!moved.length) throw new Error("El objeto no existe");
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
