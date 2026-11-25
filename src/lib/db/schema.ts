import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  // El idioma de la app para este usuario ("es" o "en"). Ver `src/lib/i18n`.
  locale: text("locale").notNull().default("es"),
  // El último número de inventario entregado. Ver `items.inventoryNumber`.
  inventorySeq: integer("inventory_seq").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Un lugar físico donde están las cosas: un estante, una caja, un mueble. */
export const shelves = pgTable(
  "shelves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // La forma del contenedor en la vista 3D: "shelf" (estantería abierta), "box" (caja) o
    // "cabinet" (mueble con puertas). Ver `src/lib/containers.ts`.
    kind: text("kind").notNull().default("shelf"),
    // Cuántos estantes tiene (en una caja, siempre 1).
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shelves_user_name_idx").on(t.userId, t.name)],
);

/**
 * Un sticker: la etiqueta de color que lleva cada objeto (Películas, Series, Anime…). Cada usuario
 * tiene los suyos; arrancan siendo los seis de siempre. `base` es qué clase de objeto es (uno de
 * `ITEM_TYPES`) y decide el catálogo, los campos y la forma en el 3D. Ver `src/lib/stickers.ts`.
 */
export const stickers = pgTable(
  "stickers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    base: text("base").notNull(),
    // Sin nombre = el nombre de su tipo en el idioma del usuario ("Películas" / "Movies").
    name: text("name"),
    // Hex, "#e2412f".
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stickers_user_idx").on(t.userId, t.position)],
);

/** Los datos propios de cada tipo (temporada, formato, autor…). Ver `src/lib/item-types.ts`. */
export type ItemAttributes = Record<string, string>;

/**
 * Lo que cambia según el idioma, tal como lo devolvió el catálogo (hoy, TMDB) en cada uno: título,
 * sinopsis, género y tapa (TMDB tiene un póster por idioma). Lo que falta en un idioma se toma de
 * las columnas comunes. Ver `src/lib/localized.ts`.
 */
export interface ItemTranslation {
  name?: string;
  description?: string | null;
  genre?: string | null;
  coverRef?: string | null;
}
export type ItemTranslations = Partial<Record<"es" | "en", ItemTranslation>>;

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Sin estante = "Sin ubicar". Borrar un estante no borra lo que tenía.
    shelfId: uuid("shelf_id").references(() => shelves.id, { onDelete: "set null" }),
    // La clase de objeto (`ITEM_TYPES`): siempre la `base` de su sticker.
    type: text("type").notNull(),
    // Su sticker. Nulo sólo en datos de antes de los stickers propios (la migración 0005 los completa).
    stickerId: uuid("sticker_id").references(() => stickers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    model: text("model"),
    attributes: jsonb("attributes").$type<ItemAttributes>().notNull().default({}),
    translations: jsonb("translations").$type<ItemTranslations>().notNull().default({}),
    // La tapa nunca se guarda: se guarda de dónde pedirla (ej. "tmdb" + "/abc.jpg").
    coverSource: text("cover_source"),
    coverRef: text("cover_ref"),
    // El registro en la API de origen (ej. "tmdb" + "movie:603").
    externalSource: text("external_source"),
    externalId: text("external_id"),
    // En qué estante del contenedor está (0 = el de arriba).
    // Orden manual de toda la colección del usuario. Ver `reorderItems`.
    position: integer("position").notNull().default(0),
    // Número de inventario correlativo por usuario (N.º 0142), el que va escrito en el lomo.
    // Nunca se reutiliza: borrar el 12 no hace que el próximo sea el 12.
    inventoryNumber: integer("inventory_number").notNull(),
    // Lo que matchea la búsqueda: en minúsculas y sin acentos (`vault_unaccent`, migración 0000).
    searchText: text("search_text").generatedAlwaysAs(
      sql`vault_unaccent(lower(coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(description, '') || ' ' || attributes::text))`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("items_user_position_idx").on(t.userId, t.position),
    uniqueIndex("items_user_inventory_idx").on(t.userId, t.inventoryNumber),
    index("items_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export type User = typeof users.$inferSelect;
export type Shelf = typeof shelves.$inferSelect;
export type Item = typeof items.$inferSelect;
export type StickerRow = typeof stickers.$inferSelect;
