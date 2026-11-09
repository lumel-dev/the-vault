import * as THREE from "three";
import type { Dims, Shape } from "@/lib/scene-layout";

/**
 * Texturas de la escena, dibujadas en canvas en el browser: nada se descarga ni se guarda salvo
 * las tapas, que vienen de TMDB. Los materiales del mundo "Mudanza": cartón kraft, cinta de papel,
 * fibrón, madera oscura y cemento.
 */

export const PALETTE = {
  kraft: "#c4935c",
  kraftDark: "#8a6238",
  tape: "#e8dcb4",
  marker: "#1c1b19",
  markerRed: "#c4321f",
  concrete: "#d9dad6",
  wood: "#4a3c30",
  woodDark: "#3a2f26",
};

/** El color del sticker circular de cada tipo, el mismo que la leyenda del riel. */
export const STICKER: Record<string, string> = {
  movie: "#e2412f",
  series: "#2f6fd6",
  book: "#3aa35a",
  music: "#f2c230",
  game: "#ef7d22",
  other: "#8b8f96",
};

export function cssFont(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Ruido fino para que las superficies no sean planas de plástico. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function kraftTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = PALETTE.kraft;
  ctx.fillRect(0, 0, 256, 256);
  // El corrugado se adivina como franjas apenas más oscuras.
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = "rgba(90,60,30,0.06)";
    ctx.fillRect(x, 0, 3, 256);
  }
  grain(ctx, 256, 256, 18, 7);
  return texture(c, [2, 2]);
}

export function woodTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(0, 0, 512, 128);
  let s = 3;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const y = rand() * 128;
    ctx.strokeStyle = `rgba(20,12,6,${0.08 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 3);
    ctx.stroke();
  }
  grain(ctx, 512, 128, 10, 11);
  return texture(c, [1, 1]);
}

export function concreteTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = PALETTE.concrete;
  ctx.fillRect(0, 0, 512, 512);
  grain(ctx, 512, 512, 14, 5);
  return texture(c, [6, 6]);
}

/** Una tira de cinta de papel escrita con fibrón. Devuelve la textura y su proporción. */
export function tapeLabel(text: string): { map: THREE.CanvasTexture; aspect: number } {
  const font = cssFont("--font-marker-app", "cursive");
  const [probe, pctx] = canvas(8, 8);
  void probe;
  pctx.font = `64px ${font}`;
  const textWidth = Math.ceil(pctx.measureText(text).width);
  const w = textWidth + 64;
  const h = 96;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = PALETTE.tape;
  // Bordes cortados a mano, no rectos.
  ctx.beginPath();
  ctx.moveTo(6, 4);
  ctx.lineTo(w - 4, 8);
  ctx.lineTo(w - 9, h / 2);
  ctx.lineTo(w - 3, h - 6);
  ctx.lineTo(4, h - 3);
  ctx.lineTo(9, h / 2);
  ctx.closePath();
  ctx.fill();
  grain(ctx, w, h, 10, 13);
  ctx.fillStyle = PALETTE.marker;
  ctx.font = `64px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, h / 2 + 4);
  const map = texture(c);
  return { map, aspect: w / h };
}

/**
 * La flecha de fibrón rojo que marca lo que coincide con la búsqueda. Una flecha y no un círculo:
 * los lomos miden 14 mm y los círculos de dos vecinos se pisaban, sin dejar claro cuál era cuál.
 * La punta queda abajo, al centro, apuntando al lomo.
 */
export function markerArrow(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 400);
  ctx.strokeStyle = PALETTE.markerRed;
  ctx.fillStyle = PALETTE.markerRed;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Palo apenas torcido, como trazado a mano.
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(60, 14);
  ctx.quadraticCurveTo(70, 160, 64, 270);
  ctx.stroke();
  // Punta llena.
  ctx.beginPath();
  ctx.moveTo(6, 250);
  ctx.lineTo(122, 246);
  ctx.lineTo(64, 392);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** La cruz de fibrón sobre lo que se está por borrar (con deshacer). */
export function markerCross(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 512);
  ctx.strokeStyle = PALETTE.markerRed;
  ctx.lineCap = "round";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(14, 30);
  ctx.lineTo(114, 482);
  ctx.moveTo(110, 26);
  ctx.lineTo(18, 486);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ lomos */

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

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
}

export interface SpineSpec {
  id: string;
  name: string;
  type: string;
  shape: Shape;
  dims: Dims;
  inventoryNumber: number;
  /** "T2" en las series. */
  badge?: string;
}

export const CELL_W = 32;
export const CELL_H = 256;
const PAGE = 2048;
const COLS = PAGE / CELL_W;
const ROWS = PAGE / CELL_H;
const PER_PAGE = COLS * ROWS;

export interface SpineAtlas {
  pages: THREE.CanvasTexture[];
  /** Página y rectángulo UV de cada lomo. */
  cells: Map<string, { page: number; u0: number; v0: number; u1: number; v1: number }>;
}

/**
 * Todos los lomos en una (o pocas) texturas grandes: 512 lomos por página de 2048 px. Una textura
 * por lomo serían cientos de subidas a la GPU; así son una o dos, y anda en el celular.
 *
 * Cada celda se dibuja en milímetros reales del lomo, así el texto no sale estirado aunque la
 * celda sea siempre del mismo tamaño.
 */
export function buildSpineAtlas(specs: SpineSpec[]): SpineAtlas {
  const sans = cssFont("--font-sans-app", "sans-serif");
  const pageCount = Math.max(1, Math.ceil(specs.length / PER_PAGE));
  const canvases = Array.from({ length: pageCount }, () => canvas(PAGE, PAGE));
  const cells = new Map<string, { page: number; u0: number; v0: number; u1: number; v1: number }>();

  specs.forEach((spec, i) => {
    const page = Math.floor(i / PER_PAGE);
    const k = i % PER_PAGE;
    const col = k % COLS;
    const rowIndex = Math.floor(k / COLS);
    const [, ctx] = canvases[page];
    const x = col * CELL_W;
    const y = rowIndex * CELL_H;

    // La cara del lomo mide t × h (en una caja suelta, el frente mide d × h).
    const faceW = (spec.shape === "parcel" ? spec.dims.t : spec.dims.t) * 1000;
    const faceH = spec.dims.h * 1000;
    const bg = spec.shape === "parcel" ? PALETTE.kraft : spineColor(spec.shape, spec.name);
    const ink = isLight(bg) ? "#1c1b19" : "#f4f2ec";

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(CELL_W / faceW, CELL_H / faceH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, faceW, faceH);

    if (spec.shape === "parcel") {
      // Un objeto suelto en su caja: el nombre escrito con fibrón en el frente.
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `${Math.min(14, faceW / 7)}px ${cssFont("--font-marker-app", "cursive")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(spec.name.slice(0, 18), faceW / 2, faceH / 2, faceW - 8);
    } else {
      // Sticker circular del tipo, arriba.
      const r = Math.min(faceW * 0.32, 4.2);
      ctx.fillStyle = STICKER[spec.type] ?? STICKER.other;
      ctx.beginPath();
      ctx.arc(faceW / 2, 6 + r, r, 0, Math.PI * 2);
      ctx.fill();

      // Título de abajo hacia arriba, como en los lomos de acá.
      const titleSize = Math.min(faceW * 0.55, 7.5);
      ctx.save();
      ctx.translate(faceW / 2, faceH - 18);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = ink;
      ctx.font = `700 ${titleSize}px ${sans}`;
      ctx.textBaseline = "middle";
      const label = spec.badge ? `${spec.name}  ${spec.badge}` : spec.name;
      ctx.fillText(label.toUpperCase(), 0, 0.5, faceH - 18 - 6 - 2 * r - 6);
      ctx.restore();

      // Número de inventario, chico, al pie.
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.75;
      ctx.font = `600 ${Math.min(faceW * 0.32, 3.6)}px ${sans}`;
      ctx.textAlign = "center";
      ctx.fillText(String(spec.inventoryNumber).padStart(4, "0"), faceW / 2, faceH - 5);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    cells.set(spec.id, {
      page,
      u0: x / PAGE,
      u1: (x + CELL_W) / PAGE,
      // flipY: la fila 0 del canvas es el borde de arriba de la textura (v = 1).
      v1: 1 - y / PAGE,
      v0: 1 - (y + CELL_H) / PAGE,
    });
  });

  const pages = canvases.map(([c]) => {
    const t = texture(c);
    t.anisotropy = 8;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
  return { pages, cells };
}
