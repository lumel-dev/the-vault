/**
 * Los stickers: la etiqueta de color de cada objeto. Cada usuario tiene los suyos (tabla
 * `stickers`); arrancan siendo uno por tipo, con estos colores. Un sticker tiene nombre, color y
 * `base`: qué clase de objeto es (`ITEM_TYPES`), que decide catálogo, campos y forma en el 3D.
 *
 * Sin dependencias del server ni de React: lo usan las actions, la escena y la interfaz.
 */

import type { Messages } from "./i18n";
import { ITEM_TYPE_KEYS, type ItemType } from "./item-types";

export interface VaultSticker {
  id: string;
  base: string;
  /** `null` en los de fábrica que no se renombraron: se muestran con el nombre de su tipo. */
  name: string | null;
  color: string;
  position: number;
}

export const DEFAULT_COLORS: Record<ItemType, string> = {
  movie: "#e2412f",
  series: "#2f6fd6",
  book: "#3aa35a",
  music: "#f2c230",
  game: "#ef7d22",
  other: "#8b8f96",
};

/** Los colores que ofrece el selector: los de librería de siempre y algunos más. */
export const STICKER_PALETTE = [
  "#e2412f",
  "#ef7d22",
  "#f2c230",
  "#3aa35a",
  "#1f8a86",
  "#2f6fd6",
  "#6a4fc9",
  "#d4498f",
  "#8a5a3b",
  "#1c1b19",
  "#8b8f96",
  "#f4f2ec",
] as const;

export function defaultStickers(): { base: ItemType; color: string; position: number }[] {
  return ITEM_TYPE_KEYS.map((base, position) => ({ base, color: DEFAULT_COLORS[base], position }));
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * El nombre que se muestra. Los de fábrica sin renombrar usan el de su tipo: en plural en el riel
 * ("Películas") y en singular al hablar de un objeto ("Película").
 */
export function stickerLabel(sticker: Pick<VaultSticker, "name" | "base">, t: Messages, one = false): string {
  if (sticker.name) return sticker.name;
  const type = t.types[sticker.base as ItemType] ?? t.types.other;
  return one ? type.label : type.plural;
}

/**
 * El sticker de un objeto. Si el suyo no está (datos viejos), el primero de su tipo, y si tampoco,
 * uno gris con el nombre del tipo: nunca falla al dibujar.
 */
export function stickerFor(
  item: { stickerId: string | null; type: string },
  stickers: VaultSticker[],
): VaultSticker {
  return (
    stickers.find((s) => s.id === item.stickerId) ??
    stickers.find((s) => s.base === item.type) ?? {
      id: "",
      base: item.type,
      name: null,
      color: DEFAULT_COLORS[item.type as ItemType] ?? DEFAULT_COLORS.other,
      position: 999,
    }
  );
}
