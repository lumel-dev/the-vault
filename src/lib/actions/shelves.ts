"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth/session";
import type { ContainerKind } from "@/lib/containers";
import { db } from "@/lib/db";
import { items, shelves } from "@/lib/db/schema";
import { messages, type Messages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { clientId, shelfSchema, type ShelfInput } from "@/lib/schemas";

export type { ShelfInput } from "@/lib/schemas";

async function session() {
  const userId = await requireUserId();
  return { userId, t: messages[await getUserLocale(userId)] };
}

function parse(input: ShelfInput, t: Messages) {
  const parsed = shelfSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const error = issue?.path[0] === "kind" ? t.errors.badKind : issue?.code === "too_big" ? t.errors.containerName : t.errors.nameMissing;
    return { error } as const;
  }
  const kind = parsed.data.kind as ContainerKind;
  // `shelves.levels` ya no se usa: los estantes salen de lo que tiene el mueble (`flowShelves`).
  return { data: { name: parsed.data.name, kind } } as const;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** `id` lo genera el browser: si ya existe, es un reenvío de la cola y no se crea otro. */
export async function createShelf(input: ShelfInput, id?: string): Promise<ActionResult<{ id: string; name: string }>> {
  const { userId, t } = await session();
  const parsed = parse(input, t);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  if (id !== undefined && !clientId.safeParse(id).success) return { ok: false, error: t.errors.invalid };
  if (id) {
    const [existing] = await db.select({ id: shelves.id, name: shelves.name, userId: shelves.userId }).from(shelves).where(eq(shelves.id, id)).limit(1);
    if (existing?.userId === userId) return { ok: true, data: { id: existing.id, name: existing.name } };
    if (existing) return { ok: false, error: t.errors.invalid };
  }
  try {
    const [row] = await db
      .insert(shelves)
      .values({
        ...(id ? { id } : {}),
        userId,
        ...parsed.data,
        position: sql`(select coalesce(max(${shelves.position}), 0) + 1 from ${shelves} where ${shelves.userId} = ${userId})`,
      })
      .returning({ id: shelves.id, name: shelves.name });
    revalidatePath("/");
    return { ok: true, data: row };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: t.errors.duplicateContainer };
    throw error;
  }
}

/**
 * Cambia nombre o forma. Los estantes no se eligen: salen de lo que tiene el mueble
 * (`flowShelves`), así que cambiar la forma no deja nada en un estante que no existe.
 */
export async function updateShelf(id: string, input: ShelfInput): Promise<ActionResult> {
  const { userId, t } = await session();
  const parsed = parse(input, t);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  try {
    const rows = await db
      .update(shelves)
      .set(parsed.data)
      .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
      .returning({ id: shelves.id });
    const ok = rows.length > 0;
    if (!ok) return { ok: false, error: t.errors.containerMissing };
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: t.errors.duplicateContainer };
    throw error;
  }
}

/** Borra el contenedor; lo que tenía queda "Sin ubicar" (FK con `on delete set null`). */
export async function deleteShelf(id: string): Promise<ActionResult> {
  const { userId, t } = await session();
  const rows = await db.transaction(async (tx) => {
    // Sin contenedor no hay estantes: todo vuelve al nivel 0.
    await tx.update(items).set({ level: 0 }).where(and(eq(items.shelfId, id), eq(items.userId, userId)));
    return tx
      .delete(shelves)
      .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
      .returning({ id: shelves.id });
  });
  if (!rows.length) return { ok: false, error: t.errors.containerMissing };
  revalidatePath("/");
  return { ok: true, data: undefined };
}
