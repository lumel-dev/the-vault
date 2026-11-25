"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { items, stickers } from "@/lib/db/schema";
import { messages } from "@/lib/i18n";
import { getUserLocale } from "@/lib/i18n/server";
import { clientId, stickerSchema, type StickerInput } from "@/lib/schemas";

export type { StickerInput } from "@/lib/schemas";

async function session() {
  const userId = await requireUserId();
  return { userId, t: messages[await getUserLocale(userId)] };
}

function parse(input: StickerInput, t: (typeof messages)["es"]) {
  const parsed = stickerSchema.safeParse(input);
  if (parsed.success) return { data: parsed.data } as const;
  const field = parsed.error.issues[0]?.path[0];
  return { error: field === "color" ? t.errors.stickerColor : field === "name" ? t.errors.stickerName : t.errors.badKind } as const;
}

async function countItems(userId: string, stickerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.stickerId, stickerId)));
  return row?.n ?? 0;
}

/** `id` lo genera el browser: si ya existe, es un reenvío de la cola y no se crea otro. */
export async function createSticker(input: StickerInput, id?: string): Promise<ActionResult<{ id: string }>> {
  const { userId, t } = await session();
  const parsed = parse(input, t);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  if (id !== undefined && !clientId.safeParse(id).success) return { ok: false, error: t.errors.invalid };
  if (id) {
    const [existing] = await db.select({ userId: stickers.userId }).from(stickers).where(eq(stickers.id, id)).limit(1);
    if (existing?.userId === userId) return { ok: true, data: { id } };
    if (existing) return { ok: false, error: t.errors.invalid };
  }
  const [row] = await db
    .insert(stickers)
    .values({
      ...(id ? { id } : {}),
      ...parsed.data,
      userId,
      position: sql`(select coalesce(max(${stickers.position}), -1) + 1 from ${stickers} where ${stickers.userId} = ${userId})`,
    })
    .returning({ id: stickers.id });
  revalidatePath("/");
  return { ok: true, data: { id: row.id } };
}

/**
 * Cambia nombre y color. El tipo (`base`) sólo cambia si el sticker está vacío: con cosas
 * adentro, cambiarlo les cambiaría los campos y la forma, y se perderían datos.
 */
export async function updateSticker(id: string, input: StickerInput): Promise<ActionResult> {
  const { userId, t } = await session();
  const parsed = parse(input, t);
  if ("error" in parsed) return { ok: false, error: parsed.error! };
  const [current] = await db
    .select({ base: stickers.base })
    .from(stickers)
    .where(and(eq(stickers.id, id), eq(stickers.userId, userId)))
    .limit(1);
  if (!current) return { ok: false, error: t.errors.stickerMissing };
  if (current.base !== parsed.data.base && (await countItems(userId, id)) > 0) {
    return { ok: false, error: t.errors.stickerBaseLocked };
  }
  await db.update(stickers).set(parsed.data).where(and(eq(stickers.id, id), eq(stickers.userId, userId)));
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * Borra un sticker. Si tiene cosas, pasan a `moveTo`, que tiene que ser otro sticker del mismo
 * usuario y del mismo tipo (así no cambia qué son ni qué datos tienen).
 */
export async function deleteSticker(id: string, moveTo?: string | null): Promise<ActionResult> {
  const { userId, t } = await session();
  const args = z.object({ id: z.uuid(), moveTo: z.uuid().nullish() }).safeParse({ id, moveTo });
  if (!args.success) return { ok: false, error: t.errors.stickerMissing };
  const result = await db.transaction(async (tx) => {
    const own = await tx
      .select({ id: stickers.id, base: stickers.base })
      .from(stickers)
      .where(eq(stickers.userId, userId));
    const sticker = own.find((s) => s.id === args.data.id);
    if (!sticker) return t.errors.stickerMissing;
    const [used] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.stickerId, sticker.id)));
    if ((used?.n ?? 0) > 0) {
      const target = own.find((s) => s.id === args.data.moveTo);
      if (!target || target.id === sticker.id) return t.errors.stickerInUse;
      if (target.base !== sticker.base) return t.errors.stickerMoveBase;
      await tx
        .update(items)
        .set({ stickerId: target.id, updatedAt: new Date() })
        .where(and(eq(items.userId, userId), eq(items.stickerId, sticker.id)));
    }
    await tx.delete(stickers).where(and(eq(stickers.id, sticker.id), eq(stickers.userId, userId)));
    return null;
  });
  if (result) return { ok: false, error: result };
  revalidatePath("/");
  return { ok: true, data: undefined };
}
