/**
 * Dónde va cada cosa en la vista 3D. Puro (sin three.js ni React): recibe los contenedores y los
 * objetos y devuelve medidas y posiciones en metros, para que la escena sólo dibuje y los tests
 * puedan verificar el armado.
 *
 * Ejes: x a la derecha, y hacia arriba, z hacia la cámara. Los muebles van en fila contra la
 * pared, de izquierda a derecha en el orden de los contenedores, y al final la mesa de "Sin
 * ubicar". Cada objeto mira con el lomo hacia la cámara (+z); en una caja, con el lomo hacia
 * arriba, como se guardan los DVDs en una caja de verdad.
 */

export interface LayoutContainer {
  id: string;
  name: string;
  kind: string;
  levels: number;
}

export interface LayoutItem {
  id: string;
  shelfId: string | null;
  level: number;
  type: string;
  name: string;
  attributes: Record<string, string>;
}

/** Medidas reales de un objeto parado: grosor del lomo (t), alto (h) y profundidad (d). */
export interface Dims {
  t: number;
  h: number;
  d: number;
}

export type Shape = "case" | "book" | "jewel" | "vinyl" | "cassette" | "vhs" | "parcel";

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** La forma y las medidas del objeto según su tipo y formato. */
export function itemShape(item: Pick<LayoutItem, "type" | "name" | "attributes">): { shape: Shape; dims: Dims } {
  const format = item.attributes.format;
  const discs = Number(item.attributes.discs) || 1;
  switch (item.type) {
    case "movie":
    case "series":
    case "game": {
      if (format === "VHS") return { shape: "vhs", dims: { t: 0.028, h: 0.205, d: 0.12 } };
      if (format === "Blu-ray" || format === "4K UHD") {
        return { shape: "case", dims: { t: discs >= 3 ? 0.02 : 0.012, h: 0.17, d: 0.135 } };
      }
      // Caja de DVD estándar (Amaray): 14 mm; las de varios discos son más gruesas.
      const t = discs >= 5 ? 0.03 : discs >= 3 ? 0.022 : 0.014;
      return { shape: "case", dims: { t, h: 0.19, d: 0.135 } };
    }
    case "book": {
      // Los libros no son todos iguales: grosor y alto varían, fijos por título.
      const r = hash(item.name);
      return { shape: "book", dims: { t: 0.018 + (r % 28) / 1000, h: 0.2 + ((r >> 5) % 45) / 1000, d: 0.15 } };
    }
    case "music": {
      if (format === "Vinilo") return { shape: "vinyl", dims: { t: 0.006, h: 0.315, d: 0.315 } };
      if (format === "Casete") return { shape: "cassette", dims: { t: 0.017, h: 0.11, d: 0.07 } };
      return { shape: "jewel", dims: { t: 0.0104, h: 0.125, d: 0.142 } };
    }
    default:
      return { shape: "parcel", dims: { t: 0.11, h: 0.12, d: 0.12 } };
  }
}

export interface PlacedItem {
  id: string;
  shape: Shape;
  dims: Dims;
  /** Centro del objeto. */
  position: [number, number, number];
  /** Parado (lomo a la cámara) o acostado en una caja (lomo arriba). */
  upright: boolean;
  containerId: string | null;
  level: number;
  /** Lugar dentro del estante, contado desde la izquierda. */
  index: number;
}

/** Un estante: dónde se puede soltar algo y dónde cae cada hueco. */
export interface Slot {
  containerId: string | null;
  level: number;
  /** Rectángulo de soltado en el plano del frente del mueble. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** z del frente, donde la escena pone el plano de arrastre. */
  z: number;
  /** El borde izquierdo de cada objeto en orden y el borde derecho del último. */
  edges: number[];
  /** Altura del piso del estante. */
  floor: number;
}

export interface PlacedContainer {
  id: string | null;
  name: string;
  kind: "shelf" | "box" | "cabinet" | "table";
  x: number;
  width: number;
  height: number;
  depth: number;
  /** Altura del piso de cada estante, de arriba hacia abajo. */
  levelFloors: number[];
  levelClear: number;
  board: number;
  count: number;
}

export interface SceneLayout {
  containers: PlacedContainer[];
  items: PlacedItem[];
  slots: Slot[];
  width: number;
  height: number;
}

const GAP = 0.3;
const BOARD = 0.02;
const SIDE = 0.02;
const PLINTH = 0.06;
const MARGIN = 0.03;
const BETWEEN = 0.0015;
const SHELF_DEPTH = 0.32;
// Más baja que una caja de DVD acostada (13,5 cm): los lomos asoman por arriba, como en una caja real.
const BOX_WALL = 0.105;
const TABLE_HEIGHT = 0.45;
const TABLE_ROW = 1.6;

function containerKind(kind: string): PlacedContainer["kind"] {
  return kind === "box" || kind === "cabinet" ? kind : "shelf";
}

/** Reparte objetos en fila desde `x0`, devolviendo los bordes de cada uno. */
function row(dims: Dims[], x0: number): { centers: number[]; edges: number[]; length: number } {
  const centers: number[] = [];
  const edges: number[] = [];
  let x = x0;
  for (const d of dims) {
    edges.push(x);
    centers.push(x + d.t / 2);
    x += d.t + BETWEEN;
  }
  edges.push(x);
  return { centers, edges, length: x - x0 };
}

export function buildLayout(containers: LayoutContainer[], allItems: LayoutItem[]): SceneLayout {
  const byContainer = new Map<string | null, LayoutItem[]>();
  for (const item of allItems) {
    const key = containers.some((c) => c.id === item.shelfId) ? item.shelfId : null;
    const list = byContainer.get(key) ?? [];
    list.push(item);
    byContainer.set(key, list);
  }

  const placedContainers: PlacedContainer[] = [];
  const placedItems: PlacedItem[] = [];
  const slots: Slot[] = [];
  let cursor = 0;
  let maxHeight = 0;

  for (const c of containers) {
    const kind = containerKind(c.kind);
    const contents = byContainer.get(c.id) ?? [];

    if (kind === "box") {
      const shaped = contents.map((i) => ({ item: i, ...itemShape(i) }));
      const inner = Math.max(0.36, shaped.reduce((s, x) => s + x.dims.t + BETWEEN, 0) + 2 * MARGIN);
      const depth = Math.max(0.24, ...shaped.map((x) => x.dims.h + 0.03));
      const { centers, edges } = row(shaped.map((x) => x.dims), cursor + SIDE + MARGIN);
      shaped.forEach((x, index) => {
        placedItems.push({
          id: x.item.id,
          shape: x.shape,
          dims: x.dims,
          // Acostado sobre el canto, lomo arriba: lo que mide de profundidad pasa a ser el alto.
          position: [centers[index], 0.012 + x.dims.d / 2, 0],
          upright: false,
          containerId: c.id,
          level: 0,
          index,
        });
      });
      const width = inner + 2 * SIDE;
      placedContainers.push({ id: c.id, name: c.name, kind, x: cursor, width, height: BOX_WALL, depth, levelFloors: [0.012], levelClear: BOX_WALL, board: SIDE, count: contents.length });
      slots.push({ containerId: c.id, level: 0, x0: cursor, x1: cursor + width, y0: 0, y1: BOX_WALL + 0.25, z: depth / 2, edges, floor: 0.012 });
      cursor += width + GAP;
      maxHeight = Math.max(maxHeight, BOX_WALL);
      continue;
    }

    const levels = Math.max(1, c.levels);
    const perLevel: { item: LayoutItem; shape: Shape; dims: Dims }[][] = Array.from({ length: levels }, () => []);
    for (const item of contents) perLevel[Math.min(Math.max(0, item.level), levels - 1)].push({ item, ...itemShape(item) });

    const longest = Math.max(0, ...perLevel.map((l) => l.reduce((s, x) => s + x.dims.t + BETWEEN, 0)));
    // Lo justo para lo que tiene y un poco de aire, como un mueble que se llenó con el tiempo.
    const inner = Math.max(0.42, longest + 2 * MARGIN + 0.08);
    const width = inner + 2 * SIDE;
    const tallest = Math.max(0.19, ...contents.map((i) => itemShape(i).dims.h));
    const clear = tallest + 0.06;
    const height = PLINTH + levels * (clear + BOARD) + BOARD;
    const depth = SHELF_DEPTH;
    const levelFloors: number[] = [];
    for (let l = 0; l < levels; l++) levelFloors.push(PLINTH + BOARD + (levels - 1 - l) * (clear + BOARD));

    perLevel.forEach((list, level) => {
      const floor = levelFloors[level];
      const { centers, edges } = row(list.map((x) => x.dims), cursor + SIDE + MARGIN);
      list.forEach((x, index) => {
        placedItems.push({
          id: x.item.id,
          shape: x.shape,
          dims: x.dims,
          // Parado con el lomo al frente, pegado al borde del estante como en un mueble real.
          position: [centers[index], floor + x.dims.h / 2, depth / 2 - 0.015 - x.dims.d / 2],
          upright: true,
          containerId: c.id,
          level,
          index,
        });
      });
      slots.push({ containerId: c.id, level, x0: cursor, x1: cursor + width, y0: floor, y1: floor + clear, z: depth / 2, edges, floor });
    });

    placedContainers.push({ id: c.id, name: c.name, kind, x: cursor, width, height, depth, levelFloors, levelClear: clear, board: BOARD, count: contents.length });
    cursor += width + GAP;
    maxHeight = Math.max(maxHeight, height);
  }

  // La mesa de "Sin ubicar": siempre está, para que haya dónde soltar lo que sale de un mueble.
  const loose = (byContainer.get(null) ?? []).map((item) => ({ item, ...itemShape(item) }));
  const rows: (typeof loose)[] = [[]];
  let rowLength = 0;
  for (const x of loose) {
    if (rowLength + x.dims.t > TABLE_ROW && rows[rows.length - 1].length) {
      rows.push([]);
      rowLength = 0;
    }
    rows[rows.length - 1].push(x);
    rowLength += x.dims.t + BETWEEN;
  }
  const longestRow = Math.max(0, ...rows.map((r) => r.reduce((s, x) => s + x.dims.t + BETWEEN, 0)));
  const tableWidth = Math.max(0.6, longestRow + 2 * MARGIN);
  const tableDepth = Math.max(0.4, rows.length * 0.17 + 0.08);
  let index = 0;
  rows.forEach((r, ri) => {
    const { centers } = row(r.map((x) => x.dims), cursor + MARGIN);
    r.forEach((x, i) => {
      placedItems.push({
        id: x.item.id,
        shape: x.shape,
        dims: x.dims,
        position: [centers[i], TABLE_HEIGHT + x.dims.h / 2, tableDepth / 2 - 0.04 - x.dims.d / 2 - ri * 0.17],
        upright: true,
        containerId: null,
        level: 0,
        index: index++,
      });
    });
  });
  const firstRow = rows[0] ?? [];
  const tableEdges = row(firstRow.map((x) => x.dims), cursor + MARGIN).edges;
  placedContainers.push({ id: null, name: "Sin ubicar", kind: "table", x: cursor, width: tableWidth, height: TABLE_HEIGHT, depth: tableDepth, levelFloors: [TABLE_HEIGHT], levelClear: 0.3, board: 0.03, count: loose.length });
  slots.push({ containerId: null, level: 0, x0: cursor, x1: cursor + tableWidth, y0: TABLE_HEIGHT - 0.1, y1: TABLE_HEIGHT + 0.32, z: tableDepth / 2, edges: tableEdges, floor: TABLE_HEIGHT });
  cursor += tableWidth;
  maxHeight = Math.max(maxHeight, TABLE_HEIGHT + 0.3);

  return { containers: placedContainers, items: placedItems, slots, width: cursor, height: maxHeight };
}

/** El estante bajo un punto del plano del frente, y en qué lugar caería algo soltado ahí. */
export function dropTarget(layout: SceneLayout, x: number, y: number): { slot: Slot; index: number } | null {
  for (const slot of layout.slots) {
    if (x < slot.x0 || x > slot.x1 || y < slot.y0 || y > slot.y1) continue;
    const edges = slot.edges;
    // Hueco más cercano: entre el borde izquierdo de cada objeto y el derecho del último.
    let index = edges.length - 1;
    for (let i = 0; i < edges.length - 1; i++) {
      const mid = (edges[i] + edges[i + 1]) / 2;
      if (x < mid) {
        index = i;
        break;
      }
    }
    return { slot, index };
  }
  return null;
}
