/**
 * Los tipos de objeto que entiende The Vault y los datos propios de cada uno.
 *
 * Todo objeto tiene las columnas comunes (nombre, descripción, marca, modelo, estante). Lo que
 * cambia según el tipo vive en `items.attributes` (JSONB) y se define acá: agregar un tipo o un
 * campo nuevo es tocar este archivo, sin migrar la base.
 *
 * Sin dependencias de React ni del server: lo usan las server actions para validar y los
 * componentes para armar el formulario.
 */

export type FieldKind = "text" | "number" | "select";

export interface AttributeField {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  placeholder?: string;
}

export interface ItemTypeDef {
  label: string;
  plural: string;
  /** Qué búsqueda de TMDB usa para sugerir datos y tapa. */
  tmdb?: "movie" | "tv";
  /** El catálogo abierto donde se buscan los que no están en TMDB. Ver `src/lib/catalogs.ts`. */
  catalog?: "books" | "albums";
  /** Si las columnas marca/modelo tienen sentido para este tipo. */
  brandModel: boolean;
  fields: readonly AttributeField[];
}

const FORMATOS_VIDEO = ["DVD", "Blu-ray", "4K UHD", "VHS", "Digital"] as const;

const formatoVideo: AttributeField = { key: "format", label: "Formato", kind: "select", options: FORMATOS_VIDEO };
const anio: AttributeField = { key: "year", label: "Año", kind: "number", placeholder: "1999" };
const discos: AttributeField = { key: "discs", label: "Discos", kind: "number", placeholder: "1" };
const region: AttributeField = { key: "region", label: "Región", kind: "text", placeholder: "4" };
const edicion: AttributeField = { key: "edition", label: "Edición", kind: "text", placeholder: "Coleccionista" };
const genero: AttributeField = { key: "genre", label: "Género", kind: "text", placeholder: "Drama" };

export const ITEM_TYPES = {
  movie: {
    label: "Película",
    plural: "Películas",
    tmdb: "movie",
    brandModel: false,
    fields: [formatoVideo, anio, genero, { key: "director", label: "Dirección", kind: "text" }, discos, region, edicion],
  },
  series: {
    label: "Serie",
    plural: "Series",
    tmdb: "tv",
    brandModel: false,
    fields: [formatoVideo, { key: "season", label: "Temporada", kind: "number", placeholder: "1" }, anio, genero, discos, region, edicion],
  },
  book: {
    label: "Libro",
    plural: "Libros",
    catalog: "books",
    brandModel: false,
    fields: [
      { key: "author", label: "Autor", kind: "text" },
      { key: "publisher", label: "Editorial", kind: "text" },
      anio,
      genero,
      { key: "isbn", label: "ISBN", kind: "text" },
    ],
  },
  music: {
    label: "Música",
    plural: "Música",
    catalog: "albums",
    brandModel: false,
    fields: [
      { key: "artist", label: "Artista", kind: "text" },
      { key: "format", label: "Formato", kind: "select", options: ["CD", "Vinilo", "Casete", "Digital"] },
      anio,
      genero,
    ],
  },
  game: {
    label: "Videojuego",
    plural: "Videojuegos",
    brandModel: false,
    fields: [{ key: "platform", label: "Plataforma", kind: "text", placeholder: "PS2" }, anio, genero],
  },
  other: {
    label: "Otro",
    plural: "Otros",
    brandModel: true,
    fields: [],
  },
} as const satisfies Record<string, ItemTypeDef>;

export type ItemType = keyof typeof ITEM_TYPES;

export const ITEM_TYPE_KEYS = Object.keys(ITEM_TYPES) as ItemType[];

export function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && value in ITEM_TYPES;
}

export function typeDef(type: string): ItemTypeDef {
  return isItemType(type) ? ITEM_TYPES[type] : ITEM_TYPES.other;
}

const MAX_ATTR = 200;

/**
 * Deja sólo los campos que el tipo declara, recortados y sin vacíos. Un número que no es número
 * se descarta en vez de guardarse como texto: la temporada "uno" no ordena ni se muestra bien.
 */
export function cleanAttributes(type: string, raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of typeDef(type).fields) {
    const value = raw[field.key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim().slice(0, MAX_ATTR);
    if (!text) continue;
    if (field.kind === "number" && !/^\d{1,6}$/.test(text)) continue;
    if (field.kind === "select" && field.options && !field.options.includes(text)) continue;
    out[field.key] = text;
  }
  return out;
}

/** La línea chica debajo del nombre en la tarjeta: "Temporada 2 · DVD", "1999 · Blu-ray". */
export function subtitle(type: string, attributes: Record<string, string>, brand?: string | null, model?: string | null): string {
  const a = attributes;
  const parts: (string | undefined)[] = [];
  switch (type) {
    case "series":
      parts.push(a.season ? `Temporada ${a.season}` : undefined, a.format);
      break;
    case "movie":
      parts.push(a.year, a.format);
      break;
    case "book":
      parts.push(a.author, a.year);
      break;
    case "music":
      parts.push(a.artist, a.format);
      break;
    case "game":
      parts.push(a.platform, a.year);
      break;
    default:
      parts.push(brand ?? undefined, model ?? undefined);
  }
  return parts.filter(Boolean).join(" · ");
}
