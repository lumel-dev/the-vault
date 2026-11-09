/**
 * Las formas de contenedor que existen en la casa y cómo se dibujan en la vista 3D. Lo usan las
 * actions para validar y la escena para armar cada mueble.
 */

export const CONTAINER_KINDS = {
  shelf: { label: "Estantería", hint: "Estantes abiertos, con los lomos a la vista", minLevels: 1, maxLevels: 8, defaultLevels: 3 },
  box: { label: "Caja", hint: "Cartón o plástico, con las cosas paradas adentro", minLevels: 1, maxLevels: 1, defaultLevels: 1 },
  cabinet: { label: "Mueble con puertas", hint: "Lo guardado se ve al abrir las puertas", minLevels: 1, maxLevels: 6, defaultLevels: 2 },
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

/** "N.º 0142": el número de inventario como va escrito en el lomo. */
export function inventoryLabel(n: number): string {
  return `N.º ${String(n).padStart(4, "0")}`;
}

/** "3.º lugar": la posición dentro del estante, contada desde la izquierda. */
export function ordinalPlace(index: number): string {
  return `${index + 1}.º lugar`;
}
