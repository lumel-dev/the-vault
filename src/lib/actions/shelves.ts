"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { shelves } from "@/lib/db/schema";
import type { ActionResult } from "./items";

const nameSchema = z.string().trim().min(1, "Falta el nombre").max(60, "Máximo 60 caracteres");

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function createShelf(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  const userId = await requireUserId();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const [row] = await db
      .insert(shelves)
      .values({
        userId,
        name: parsed.data,
        position: sql`(select coalesce(max(${shelves.position}), 0) + 1 from ${shelves} where ${shelves.userId} = ${userId})`,
      })
      .returning({ id: shelves.id, name: shelves.name });
    revalidatePath("/");
    return { ok: true, data: row };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Ya tenés un estante con ese nombre" };
    throw error;
  }
}

export async function renameShelf(id: string, name: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const rows = await db
      .update(shelves)
      .set({ name: parsed.data })
      .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
      .returning({ id: shelves.id });
    if (!rows.length) return { ok: false, error: "El estante no existe" };
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "Ya tenés un estante con ese nombre" };
    throw error;
  }
}

/** Borra el estante; lo que tenía queda "Sin ubicar" (FK con `on delete set null`). */
export async function deleteShelf(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const rows = await db
    .delete(shelves)
    .where(and(eq(shelves.id, id), eq(shelves.userId, userId)))
    .returning({ id: shelves.id });
  if (!rows.length) return { ok: false, error: "El estante no existe" };
  revalidatePath("/");
  return { ok: true, data: undefined };
}
