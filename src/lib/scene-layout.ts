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
  /** Contra qué pared va: la de la izquierda o la del fondo (la habitación es una L). */
  wall: "left" | "back";
  /** Dónde queda en la habitación el punto local (x, 0, 0) del mueble, y cuánto está girado. */
  origin: [number, number, number];
  rotationY: number;
}

export interface SceneLayout {
  containers: PlacedContainer[];
  items: PlacedItem[];
  slots: Slot[];
  /** Largo de la fila desplegada (todos los muebles uno al lado del otro). */
  width: number;
  height: number;
  /** Cuánto ocupa cada pared, medido desde el rincón. */
  leftLength: number;
  backLength: number;
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
/** Lo que se deja libre en el rincón para que los muebles de las dos paredes no se toquen. */
export const CORNER = 0.42;

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
      placedContainers.push({ id: c.id, name: c.name, kind, x: cursor, width, height: BOX_WALL, depth, levelFloors: [0.012], levelClear: BOX_WALL, board: SIDE, count: contents.length, wall: "back", origin: [0, 0, 0], rotationY: 0 });
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

    placedContainers.push({ id: c.id, name: c.name, kind, x: cursor, width, height, depth, levelFloors, levelClear: clear, board: BOARD, count: contents.length, wall: "back", origin: [0, 0, 0], rotationY: 0 });
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
  placedContainers.push({ id: null, name: "Sin ubicar", kind: "table", x: cursor, width: tableWidth, height: TABLE_HEIGHT, depth: tableDepth, levelFloors: [TABLE_HEIGHT], levelClear: 0.3, board: 0.03, count: loose.length, wall: "back", origin: [0, 0, 0], rotationY: 0 });
  slots.push({ containerId: null, level: 0, x0: cursor, x1: cursor + tableWidth, y0: TABLE_HEIGHT - 0.1, y1: TABLE_HEIGHT + 0.32, z: tableDepth / 2, edges: tableEdges, floor: TABLE_HEIGHT });
  cursor += tableWidth;
  maxHeight = Math.max(maxHeight, TABLE_HEIGHT + 0.3);

  const { leftLength, backLength } = foldIntoL(placedContainers);
  return { containers: placedContainers, items: placedItems, slots, width: cursor, height: maxHeight, leftLength, backLength };
}

/**
 * Pliega la fila de muebles en una L, como en una habitación: los primeros van contra la pared de
 * la izquierda (de adelante hacia el rincón) y el resto contra la del fondo (del rincón hacia la
 * derecha), con la mesa de "Sin ubicar" siempre al final. Así la casa entra en pantalla sin una
 * fila de seis metros y la cámara la mira en diagonal, desde el centro de la habitación.
 *
 * Con menos de tres muebles no hay L: todo va contra el fondo.
 *
 * Paredes: la del fondo es el plano z = 0 y la de la izquierda el plano x = 0; el rincón es el
 * origen. Cada mueble tiene su espalda pegada a su pared.
 */
function foldIntoL(containers: PlacedContainer[]): { leftLength: number; backLength: number } {
  const furniture = containers.filter((c) => c.kind !== "table");
  const total = containers.reduce((s, c) => s + c.width, 0) + GAP * Math.max(0, containers.length - 1);
  let split = 0;
  if (furniture.length >= 3) {
    // Cuántos muebles van a la izquierda: los que dejan esa pared más cerca del 40 % del total,
    // con al menos uno de cada lado.
    let best = Infinity;
    let length = 0;
    for (let k = 1; k < furniture.length; k++) {
      length += furniture[k - 1].width + (k > 1 ? GAP : 0);
      const diff = Math.abs(length - total * 0.4);
      if (diff < best) {
        best = diff;
        split = k;
      }
    }
  }

  // Pared izquierda: el primero queda adelante y el último contra el rincón.
  const left = containers.slice(0, split);
  const leftLength = left.reduce((s, c) => s + c.width, 0) + GAP * Math.max(0, left.length - 1);
  let along = CORNER + leftLength;
  for (const c of left) {
    c.wall = "left";
    c.rotationY = Math.PI / 2;
    // Girado 90°: el x local del mueble avanza hacia el rincón (z decrece) y su frente mira a +x.
    c.origin = [c.depth / 2, 0, along];
    along -= c.width + GAP;
  }

  let cursor = CORNER;
  for (const c of containers.slice(split)) {
    c.wall = "back";
    c.rotationY = 0;
    c.origin = [cursor, 0, c.depth / 2];
    cursor += c.width + GAP;
  }
  return { leftLength: split ? CORNER + leftLength : 0, backLength: cursor - GAP };
}

type Vec3 = [number, number, number];

/** Un punto en coordenadas de la fila (las de `PlacedItem.position`) a la habitación. */
export function toWorld(c: PlacedContainer, p: Vec3): Vec3 {
  const u = p[0] - c.x;
  const cos = Math.cos(c.rotationY);
  const sin = Math.sin(c.rotationY);
  return [c.origin[0] + u * cos + p[2] * sin, c.origin[1] + p[1], c.origin[2] - u * sin + p[2] * cos];
}

/** Al revés: un punto de la habitación a las coordenadas de la fila de ese mueble. */
export function toLocal(c: PlacedContainer, w: Vec3): Vec3 {
  const dx = w[0] - c.origin[0];
  const dz = w[2] - c.origin[2];
  const cos = Math.cos(c.rotationY);
  const sin = Math.sin(c.rotationY);
  return [c.x + dx * cos - dz * sin, w[1] - c.origin[1], dx * sin + dz * cos];
}

/** Hacia dónde mira el frente de un mueble, en la habitación. */
export function frontNormal(c: PlacedContainer): Vec3 {
  return [Math.sin(c.rotationY), 0, Math.cos(c.rotationY)];
}

/** En qué lugar de un estante cae algo soltado a la altura `x` (coordenadas de la fila). */
export function slotIndex(slot: Slot, x: number): number {
  const edges = slot.edges;
  // Hueco más cercano: entre el borde izquierdo de cada objeto y el derecho del último.
  for (let i = 0; i < edges.length - 1; i++) if (x < (edges[i] + edges[i + 1]) / 2) return i;
  return edges.length - 1;
}

/** El estante bajo un punto del frente de los muebles (coordenadas de la fila), y el lugar. */
export function dropTarget(layout: SceneLayout, x: number, y: number): { slot: Slot; index: number } | null {
  const slot = layout.slots.find((s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1);
  return slot ? { slot, index: slotIndex(slot, x) } : null;
}
