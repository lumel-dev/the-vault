/**
 * Dónde está un objeto, dicho como lo diría alguien en la casa: "CAJA 3 · 3.º lugar" o
 * "LIVING · ESTANTE 2 · 5.º lugar". Se calcula con la colección en su orden manual.
 */

import type { Messages } from "./i18n";

interface WhereItem {
  id: string;
  shelfId: string | null;
  level: number;
}

interface WhereShelf {
  id: string;
  name: string;
  kind: string;
  levels: number;
}

export interface Whereabouts {
  container: string;
  level: string | null;
  place: string;
}

export function whereabouts(item: WhereItem, ordered: WhereItem[], shelves: WhereShelf[], t: Messages): Whereabouts {
  const shelf = shelves.find((s) => s.id === item.shelfId) ?? null;
  const level = shelf ? Math.min(item.level, shelf.levels - 1) : 0;
  const neighbours = ordered.filter((i) => i.shelfId === (shelf?.id ?? null) && (shelf ? Math.min(i.level, shelf.levels - 1) : 0) === level);
  const index = Math.max(0, neighbours.findIndex((i) => i.id === item.id));
  return {
    container: shelf ? shelf.name : t.where.unplaced,
    level: shelf && shelf.levels > 1 ? t.where.level(level + 1) : null,
    place: t.where.place(index + 1),
  };
}

export function whereLabel(w: Whereabouts): string {
  return [w.container, w.level, w.place].filter(Boolean).join(" · ");
}
