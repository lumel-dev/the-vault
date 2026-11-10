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

import type { Messages } from "./i18n";

export type FieldKind = "text" | "number" | "select";

export interface AttributeField {
  /** También es la clave de su etiqueta en el diccionario: `t.fields[key]`. */
  key: keyof Messages["fields"];
  kind: FieldKind;
  /** Los valores se guardan tal cual (en castellano); se muestran con `t.options[valor]`. */
  options?: readonly string[];
  /** Un ejemplo literal ("1999") o la clave de uno traducido en `t.placeholders`. */
  placeholder?: string;
}

/** Las etiquetas ("Película", "Movies") están en el diccionario: `t.types[tipo]`. */
export interface ItemTypeDef {
  /** Qué búsqueda de TMDB usa para sugerir datos y tapa. */
  tmdb?: "movie" | "tv";
  /** El catálogo abierto donde se buscan los que no están en TMDB. Ver `src/lib/catalogs.ts`. */
  catalog?: "books" | "albums";
  /** Si las columnas marca/modelo tienen sentido para este tipo. */
  brandModel: boolean;
  fields: readonly AttributeField[];
}

const FORMATOS_VIDEO = ["DVD", "Blu-ray", "4K UHD", "VHS", "Digital"] as const;

const formatoVideo: AttributeField = { key: "format", kind: "select", options: FORMATOS_VIDEO };
const anio: AttributeField = { key: "year", kind: "number", placeholder: "1999" };
const discos: AttributeField = { key: "discs", kind: "number", placeholder: "1" };
const region: AttributeField = { key: "region", kind: "text", placeholder: "4" };
const edicion: AttributeField = { key: "edition", kind: "text", placeholder: "edition" };
const genero: AttributeField = { key: "genre", kind: "text", placeholder: "genre" };

export const ITEM_TYPES = {
  movie: {
    tmdb: "movie",
    brandModel: false,
    fields: [formatoVideo, anio, genero, { key: "director", kind: "text" }, discos, region, edicion],
  },
  series: {
    tmdb: "tv",
    brandModel: false,
    fields: [formatoVideo, { key: "season", kind: "number", placeholder: "1" }, anio, genero, discos, region, edicion],
  },
  book: {
    catalog: "books",
    brandModel: false,
    fields: [
      { key: "author", kind: "text" },
      { key: "publisher", kind: "text" },
      anio,
      genero,
      { key: "isbn", kind: "text" },
    ],
  },
  music: {
    catalog: "albums",
    brandModel: false,
    fields: [
      { key: "artist", kind: "text" },
      { key: "format", kind: "select", options: ["CD", "Vinilo", "Casete", "Digital"] },
      anio,
      genero,
    ],
  },
  game: {
    brandModel: false,
    fields: [{ key: "platform", kind: "text", placeholder: "PS2" }, anio, genero],
  },
  other: {
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
export function subtitle(type: string, attributes: Record<string, string>, t: Messages, brand?: string | null, model?: string | null): string {
  const a = attributes;
  const format = a.format ? (t.options[a.format] ?? a.format) : undefined;
  const parts: (string | undefined)[] = [];
  switch (type) {
    case "series":
      parts.push(a.season ? t.season(a.season) : undefined, format);
      break;
    case "movie":
      parts.push(a.year, format);
      break;
    case "book":
      parts.push(a.author, a.year);
      break;
    case "music":
      parts.push(a.artist, format);
      break;
    case "game":
      parts.push(a.platform, a.year);
      break;
    default:
      parts.push(brand ?? undefined, model ?? undefined);
  }
  return parts.filter(Boolean).join(" · ");
}
