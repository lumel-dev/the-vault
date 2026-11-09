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
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shelves_user_name_idx").on(t.userId, t.name)],
);

/** Los datos propios de cada tipo (temporada, formato, autor…). Ver `src/lib/item-types.ts`. */
export type ItemAttributes = Record<string, string>;

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Sin estante = "Sin ubicar". Borrar un estante no borra lo que tenía.
    shelfId: uuid("shelf_id").references(() => shelves.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    model: text("model"),
    attributes: jsonb("attributes").$type<ItemAttributes>().notNull().default({}),
    // La tapa nunca se guarda: se guarda de dónde pedirla (ej. "tmdb" + "/abc.jpg").
    coverSource: text("cover_source"),
    coverRef: text("cover_ref"),
    // El registro en la API de origen (ej. "tmdb" + "movie:603").
    externalSource: text("external_source"),
    externalId: text("external_id"),
    // Orden manual de toda la colección del usuario. Ver `reorderItems`.
    position: integer("position").notNull().default(0),
    // Lo que matchea la búsqueda: en minúsculas y sin acentos (`vault_unaccent`, migración 0000).
    searchText: text("search_text").generatedAlwaysAs(
      sql`vault_unaccent(lower(coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(description, '') || ' ' || attributes::text))`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("items_user_position_idx").on(t.userId, t.position),
    index("items_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export type User = typeof users.$inferSelect;
export type Shelf = typeof shelves.$inferSelect;
export type Item = typeof items.$inferSelect;
