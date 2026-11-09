import "server-only";

import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { items, shelves } from "@/lib/db/schema";
import { isItemType } from "@/lib/item-types";

/** Qué estante se está mirando: todos, los que no tienen estante, o uno puntual (uuid). */
export type ShelfFilter = "all" | "none" | string;

export interface ItemFilters {
  q?: string;
  type?: string;
  shelf?: ShelfFilter;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Escapa los comodines de LIKE para que un "%" tipeado se busque literal. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Cada palabra de la búsqueda tiene que aparecer, sin importar acentos ni mayúsculas. Si no
 * aparece tal cual, alcanza con que se parezca (`word_similarity` de pg_trgm): "matirx" encuentra
 * Matrix (0,43). El umbral es bajo a propósito porque los títulos son palabras cortas y dos letras
 * cruzadas cambian muchos trigramas. Por lo mismo, una palabra de menos de 4 letras sólo matchea
 * tal cual: "de" o "la" se parecen a casi todo.
 */
export function searchCondition(q: string): SQL | undefined {
  const terms = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return undefined;
  return and(
    ...terms.map((term) => {
      const contains = sql`${items.searchText} like '%' || vault_unaccent(lower(${escapeLike(term)})) || '%'`;
      if (term.length < 4) return contains;
      return sql`(${contains} or word_similarity(vault_unaccent(lower(${term})), ${items.searchText}) >= 0.4)`;
    }),
  );
}

export async function listItems(userId: string, filters: ItemFilters = {}) {
  const conditions: (SQL | undefined)[] = [eq(items.userId, userId)];
  if (filters.type && isItemType(filters.type)) conditions.push(eq(items.type, filters.type));
  if (filters.shelf === "none") conditions.push(isNull(items.shelfId));
  else if (isUuid(filters.shelf)) conditions.push(eq(items.shelfId, filters.shelf));
  if (filters.q) conditions.push(searchCondition(filters.q));

  return db
    .select({
      id: items.id,
      shelfId: items.shelfId,
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
    })
    .from(items)
    .where(and(...conditions))
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
    .select({ id: shelves.id, name: shelves.name, position: shelves.position, count: sql<number>`coalesce(${counts.n}, 0)` })
    .from(shelves)
    .leftJoin(counts, eq(counts.shelfId, shelves.id))
    .where(eq(shelves.userId, userId))
    .orderBy(asc(shelves.position), asc(shelves.name));

  const [unshelved] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.userId, userId), isNull(items.shelfId)));
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(items).where(eq(items.userId, userId));

  return { shelves: rows, unshelved: unshelved?.n ?? 0, total: total?.n ?? 0 };
}

export type VaultShelf = Awaited<ReturnType<typeof listShelves>>["shelves"][number];
