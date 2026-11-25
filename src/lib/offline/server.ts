import "server-only";

/**
 * Aplica un cambio de la cola con las mismas server actions que usaba la app antes de la cola:
 * validan, chequean que todo sea del usuario de la sesión y son idempotentes por el id que generó
 * el browser. Un cambio hecho sin señal pasa por exactamente las mismas reglas.
 */
import { and, eq } from "drizzle-orm";
import type { ActionResult } from "@/lib/action-result";
import { createItem, deleteItem, placeItem, reorderItems, updateItem } from "@/lib/actions/items";
import { createShelf, deleteShelf, updateShelf } from "@/lib/actions/shelves";
import { createSticker, deleteSticker, updateSticker } from "@/lib/actions/stickers";
import { db } from "@/lib/db";
import { items, shelves, stickers } from "@/lib/db/schema";
import type { ItemInput, ShelfInput, StickerInput } from "@/lib/schemas";
import type { Op, OpResult } from "./ops";

async function exists(table: typeof items | typeof shelves | typeof stickers, id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function run(op: Op): Promise<ActionResult<object | undefined>> {
  switch (op.kind) {
    case "createItem":
      return createItem(op.input as ItemInput, op.id);
    case "updateItem":
      return updateItem(op.id, op.input as ItemInput);
    case "deleteItem":
      return deleteItem(op.id);
    case "placeItem":
      return placeItem(op.id, op.shelfId, op.index);
    case "reorderItems":
      return reorderItems(op.ids);
    case "createShelf":
      return createShelf(op.input as ShelfInput, op.id);
    case "updateShelf":
      return updateShelf(op.id, op.input as ShelfInput);
    case "deleteShelf":
      return deleteShelf(op.id);
    case "createSticker":
      return createSticker(op.input as StickerInput, op.id);
    case "updateSticker":
      return updateSticker(op.id, op.input as StickerInput);
    case "deleteSticker":
      return deleteSticker(op.id, op.moveTo);
  }
}

/** Borrar algo que ya no está es lo que se quería: un reenvío, o se borró desde otro lado. */
const DELETES: Partial<Record<Op["kind"], typeof items | typeof shelves | typeof stickers>> = {
  deleteItem: items,
  deleteShelf: shelves,
  deleteSticker: stickers,
};

export async function applyQueued(seq: number, op: Op, userId: string): Promise<OpResult> {
  let res: Awaited<ReturnType<typeof run>>;
  try {
    res = await run(op);
  } catch (error) {
    console.error("[sync]", op.kind, error);
    return { seq, result: "retry" };
  }
  if (res.ok) {
    const n = res.data && "inventoryNumber" in res.data && typeof res.data.inventoryNumber === "number" ? res.data.inventoryNumber : undefined;
    return n === undefined ? { seq, result: "applied" } : { seq, result: "applied", inventoryNumber: n };
  }
  if (res.retry) return { seq, result: "retry" };
  const table = DELETES[op.kind];
  if (table && "id" in op && !(await exists(table, op.id, userId))) return { seq, result: "applied" };
  return { seq, result: "rejected", error: res.error };
}
