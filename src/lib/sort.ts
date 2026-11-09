/**
 * Cómo se puede ordenar la colección. "Manual" es el orden que el usuario armó arrastrando (y el
 * que tienen los muebles); los demás ordenan la grilla, o acomodan un contenedor si se aplican.
 */

import { ITEM_TYPE_KEYS } from "./item-types";

export const SORTS = {
  manual: "Orden propio",
  name: "Nombre",
  genre: "Género",
  type: "Tipo",
  year: "Año",
} as const;

export type SortKey = keyof typeof SORTS;

export const SORT_KEYS = Object.keys(SORTS) as SortKey[];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && value in SORTS;
}

interface Sortable {
  name: string;
  type: string;
  attributes: Record<string, string>;
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

// Como en una biblioteca: "El padrino" va con la P y "The Matrix" con la M.
const ARTICLE = /^(el|la|los|las|lo|un|una|unos|unas|the|a|an)\s+/i;

export function sortName(name: string): string {
  return name.trim().replace(ARTICLE, "");
}

function byName(a: Sortable, b: Sortable): number {
  return (
    collator.compare(sortName(a.name), sortName(b.name)) ||
    // Las temporadas de una misma serie, en orden.
    (Number(a.attributes.season) || 0) - (Number(b.attributes.season) || 0)
  );
}

/** Lo que falta (sin género, sin año) va al final, no al principio. */
function blankLast(a: string | undefined, b: string | undefined, compare: (x: string, y: string) => number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compare(a, b);
}

export function compareBy(key: SortKey): ((a: Sortable, b: Sortable) => number) | null {
  switch (key) {
    case "name":
      return byName;
    case "genre":
      return (a, b) => blankLast(a.attributes.genre, b.attributes.genre, (x, y) => collator.compare(x, y)) || byName(a, b);
    case "type":
      return (a, b) => ITEM_TYPE_KEYS.indexOf(a.type as never) - ITEM_TYPE_KEYS.indexOf(b.type as never) || byName(a, b);
    case "year":
      return (a, b) => blankLast(a.attributes.year, b.attributes.year, (x, y) => Number(x) - Number(y)) || byName(a, b);
    default:
      return null;
  }
}

/** Una copia ordenada; con "manual" devuelve la misma lista, en el orden de los muebles. */
export function sortItems<T extends Sortable>(items: T[], key: SortKey): T[] {
  const compare = compareBy(key);
  return compare ? [...items].sort(compare) : items;
}
