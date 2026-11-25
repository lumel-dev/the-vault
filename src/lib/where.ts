/**
 * Dónde está un objeto, dicho como lo diría alguien en la casa: "CAJA 3 · 3.º lugar" o
 * "LIVING · ESTANTE 2 · 5.º lugar". Se calcula con la colección en su orden manual: el estante
 * sale de repartir lo del mueble en estantes de 80 cm (`flowShelves`), igual que en el 3D.
 */

import type { Messages } from "./i18n";
import { flowShelves, type LayoutItem } from "./scene-layout";

interface WhereShelf {
  id: string;
  name: string;
  kind: string;
}

export interface Whereabouts {
  container: string;
  level: string | null;
  place: string;
}

/** En qué estante (0 = arriba) y en qué lugar de ese estante queda cada objeto de un contenedor. */
export function shelfSpots<T extends LayoutItem>(shelf: WhereShelf | null, contents: T[]): Map<string, { level: number; index: number; levels: number }> {
  const levels = shelf && shelf.kind !== "box" ? flowShelves(contents) : [contents];
  const out = new Map<string, { level: number; index: number; levels: number }>();
  levels.forEach((list, level) => list.forEach((item, index) => out.set(item.id, { level, index, levels: levels.length })));
  return out;
}

export function whereabouts<T extends LayoutItem>(item: T, ordered: T[], shelves: WhereShelf[], t: Messages): Whereabouts {
  const shelf = shelves.find((s) => s.id === item.shelfId) ?? null;
  const contents = ordered.filter((i) => (shelf ? i.shelfId === shelf.id : !shelves.some((s) => s.id === i.shelfId)));
  const spot = shelfSpots(shelf, contents).get(item.id) ?? { level: 0, index: 0, levels: 1 };
  return {
    container: shelf ? shelf.name : t.where.unplaced,
    level: shelf && spot.levels > 1 ? t.where.level(spot.level + 1) : null,
    place: t.where.place(spot.index + 1),
  };
}

export function whereLabel(w: Whereabouts): string {
  return [w.container, w.level, w.place].filter(Boolean).join(" · ");
}
