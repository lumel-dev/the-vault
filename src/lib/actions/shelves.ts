"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { clampLevels, CONTAINER_KINDS, isContainerKind, type ContainerKind } from "@/lib/containers";
import { db } from "@/lib/db";
import { items, shelves } from "@/lib/db/schema";
import type { ActionResult } from "./items";

const shelfSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre").max(60, "Máximo 60 caracteres"),
  kind: z.string().refine(isContainerKind, "Forma desconocida").default("shelf"),
  levels: z.number().int().optional(),
});

export type ShelfInput = z.input<typeof shelfSchema>;

function parse(input: ShelfInput) {
  const parsed = shelfSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const kind = parsed.data.kind as ContainerKind;
  return { data: { name: parsed.data.name, kind, levels: clampLevels(kind, parsed.data.levels ?? CONTAINER_KINDS[kind].defaultLevels) } } as const;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const DUPLICATE = "Ya tenés un contenedor con ese nombre";

export async function createShelf(input: ShelfInput): Promise<ActionResult<{ id: string; name: string }>> {
  const userId = await requireUserId();
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  try {
    const [row] = await db
      .insert(shelves)
      .values({
        userId,
        ...parsed.data,
        position: sql`(select coalesce(max(${shelves.position}), 0) + 1 from ${shelves} where ${shelves.userId} = ${userId})`,
      })
      .returning({ id: shelves.id, name: shelves.name });
    revalidatePath("/");
    return { ok: true, data: row };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE };
    throw error;
  }
}

/**
 * Cambia nombre, forma o cantidad de estantes. Si quedan menos estantes, lo que estaba en los que
 * desaparecen baja al último que queda: nada se pierde ni queda en un estante que no existe.
 */
export async function updateShelf(id: string, input: ShelfInput): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = parse(input);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  try {
    const ok = await db.transaction(async (tx) => {
      const rows = await tx
        .update(shelves)
        .set(parsed.data)
        .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
        .returning({ id: shelves.id });
      if (!rows.length) return false;
      await tx
        .update(items)
        .set({ level: parsed.data.levels - 1 })
        .where(and(eq(items.shelfId, id), eq(items.userId, userId), gte(items.level, parsed.data.levels)));
      return true;
    });
    if (!ok) return { ok: false, error: "El contenedor no existe" };
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE };
    throw error;
  }
}

/** Borra el contenedor; lo que tenía queda "Sin ubicar" (FK con `on delete set null`). */
export async function deleteShelf(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const rows = await db.transaction(async (tx) => {
    // Sin contenedor no hay estantes: todo vuelve al nivel 0.
    await tx.update(items).set({ level: 0 }).where(and(eq(items.shelfId, id), eq(items.userId, userId)));
    return tx
      .delete(shelves)
      .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
      .returning({ id: shelves.id });
  });
  if (!rows.length) return { ok: false, error: "El contenedor no existe" };
  revalidatePath("/");
  return { ok: true, data: undefined };
}
