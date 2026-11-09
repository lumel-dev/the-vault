import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, shelves } from "@/lib/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Toda la colección del usuario, en su orden manual. Se manda entera al browser (una colección
 * típica tiene 100 a 500 objetos): la búsqueda y los filtros corren ahí, al instante, y la vista
 * 3D necesita todos los objetos para dibujar los muebles completos.
 */
export async function listItems(userId: string) {
  return db
    .select({
      id: items.id,
      shelfId: items.shelfId,
      level: items.level,
      type: items.type,
      name: items.name,
      description: items.description,
      brand: items.brand,
      model: items.model,
      attributes: items.attributes,
      coverSource: items.coverSource,
      coverRef: items.coverRef,
      externalSource: items.externalSource,
      externalId: items.externalId,
      position: items.position,
      inventoryNumber: items.inventoryNumber,
    })
    .from(items)
    .where(eq(items.userId, userId))
    .orderBy(asc(items.position), asc(items.createdAt));
}

export type VaultItem = Awaited<ReturnType<typeof listItems>>[number];

export async function listShelves(userId: string) {
  const counts = db
    .select({ shelfId: items.shelfId, n: sql<number>`count(*)::int`.as("n") })
    .from(items)
    .where(eq(items.userId, userId))
    .groupBy(items.shelfId)
    .as("counts");

  const rows = await db
    .select({
      id: shelves.id,
      name: shelves.name,
      kind: shelves.kind,
      levels: shelves.levels,
      position: shelves.position,
      count: sql<number>`coalesce(${counts.n}, 0)`,
    })
    .from(shelves)
    .leftJoin(counts, eq(counts.shelfId, shelves.id))
    .where(eq(shelves.userId, userId))
    .orderBy(asc(shelves.position), asc(shelves.name));

  const [unshelved] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.userId, userId), isNull(items.shelfId)));

  return { shelves: rows, unshelved: unshelved?.n ?? 0 };
}

export type VaultShelf = Awaited<ReturnType<typeof listShelves>>["shelves"][number];
