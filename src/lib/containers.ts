import type { Messages } from "./i18n";

/**
 * Las formas de contenedor que existen en la casa y cómo se dibujan en la vista 3D. Lo usan las
 * actions para validar y la escena para armar cada mueble.
 */

export const CONTAINER_KINDS = {
  shelf: {},
  box: {},
  cabinet: {},
} as const;

export type ContainerKind = keyof typeof CONTAINER_KINDS;

export const CONTAINER_KIND_KEYS = Object.keys(CONTAINER_KINDS) as ContainerKind[];

export function isContainerKind(value: unknown): value is ContainerKind {
  return typeof value === "string" && value in CONTAINER_KINDS;
}

/** "N.º 0142" / "No. 0142": el número de inventario como va escrito en el lomo. */
/** El número que va en el lomo. Lo cargado sin señal todavía no tiene: "N.º —" hasta que se sube. */
export function inventoryLabel(n: number, t: Messages): string {
  if (n <= 0) return t.inventory("—");
  return t.inventory(String(n).padStart(4, "0"));
}
