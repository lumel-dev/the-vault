/**
 * Qué se acepta al guardar un objeto, un contenedor o un sticker. Lo usan las server actions y
 * también el browser, que valida antes de encolar un cambio: así un error de tipeo se avisa al
 * instante, haya señal o no (`src/lib/offline/apply.ts`).
 */
import { z } from "zod";
import { isContainerKind } from "./containers";
import { isItemType } from "./item-types";
import { isHexColor } from "./stickers";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const itemSchema = z.object({
  type: z.string().refine(isItemType),
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  brand: optionalText(120),
  model: optionalText(120),
  shelfId: z.uuid().nullish().transform((v) => v ?? null),
  // El sticker manda: el tipo del objeto es su `base`. Sin sticker, el primero del tipo.
  stickerId: z.uuid().nullish(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  coverSource: z.string().nullish(),
  coverRef: z.string().nullish(),
  externalSource: z.enum(["tmdb", "openlibrary", "musicbrainz"]).nullish(),
  externalId: z.string().max(80).nullish(),
});

export type ItemInput = z.input<typeof itemSchema>;

/** Cómo es el id de cada catálogo: "movie:603", "work:OL14860424W", "release-group:<mbid>". */
export const EXTERNAL_ID: Record<string, RegExp> = {
  tmdb: /^(movie|tv):\d{1,10}$/,
  openlibrary: /^work:OL\d{1,12}W$/,
  musicbrainz: /^release-group:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
};

export const shelfSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.string().refine(isContainerKind).default("shelf"),
});

export type ShelfInput = z.input<typeof shelfSchema>;

export const stickerSchema = z.object({
  // Vacío = el nombre de su tipo, en el idioma de quien lo mira (los de fábrica empiezan así).
  name: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v || null),
  color: z.string().refine(isHexColor),
  base: z.string().refine(isItemType),
});

export type StickerInput = z.input<typeof stickerSchema>;

/** El id que genera el browser para lo que crea (así reenviarlo no lo duplica). */
export const clientId = z.uuid();
