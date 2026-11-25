import type { Shape } from "./scene-layout";

/**
 * Los colores de los lomos, los mismos en la escena 3D y en la vista de lomos de la grilla. Sin
 * three.js: la grilla no carga el 3D.
 */

/** Paleta de lomos: la mayoría negros, como en un estante real, y algunos de color. */
const SPINE_COLORS = ["#161617", "#161617", "#161617", "#1d2a4a", "#5a1813", "#24382a", "#e8e5de", "#2b2b2e", "#3d2a4f"];
const BOOK_COLORS = ["#7a2f24", "#24425f", "#2f4a33", "#d8c9a3", "#9c6b2f", "#3b3b3b", "#6d5a8a", "#b9442f"];

function pick<T>(list: T[], text: string): T {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return list[h % list.length];
}

export function spineColor(shape: Shape, name: string): string {
  return shape === "book" ? pick(BOOK_COLORS, name) : pick(SPINE_COLORS, name);
}

export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
}
