import type { Messages } from "./i18n";

/**
 * Las formas de contenedor que existen en la casa y cómo se dibujan en la vista 3D. Lo usan las
 * actions para validar y la escena para armar cada mueble.
 */

export const CONTAINER_KINDS = {
  shelf: { minLevels: 1, maxLevels: 8, defaultLevels: 3 },
  box: { minLevels: 1, maxLevels: 1, defaultLevels: 1 },
  cabinet: { minLevels: 1, maxLevels: 6, defaultLevels: 2 },
} as const;

export type ContainerKind = keyof typeof CONTAINER_KINDS;

export const CONTAINER_KIND_KEYS = Object.keys(CONTAINER_KINDS) as ContainerKind[];

export function isContainerKind(value: unknown): value is ContainerKind {
  return typeof value === "string" && value in CONTAINER_KINDS;
}

/** Ajusta la cantidad de estantes a lo que admite la forma (una caja tiene uno solo). */
export function clampLevels(kind: ContainerKind, levels: number): number {
  const k = CONTAINER_KINDS[kind];
  if (!Number.isFinite(levels)) return k.defaultLevels;
  return Math.min(k.maxLevels, Math.max(k.minLevels, Math.round(levels)));
}

/** "N.º 0142" / "No. 0142": el número de inventario como va escrito en el lomo. */
export function inventoryLabel(n: number, t: Messages): string {
  return t.inventory(String(n).padStart(4, "0"));
}
