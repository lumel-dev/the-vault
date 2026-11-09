ALTER TABLE "items" ADD COLUMN "level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- El número de inventario entra nullable, se numera lo que ya existe (por fecha de alta, por
-- usuario) y recién ahí pasa a NOT NULL: agregarlo NOT NULL de una falla con filas cargadas.
ALTER TABLE "items" ADD COLUMN "inventory_number" integer;--> statement-breakpoint
UPDATE "items" SET "inventory_number" = n.rn
  FROM (SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS rn FROM "items") n
  WHERE "items"."id" = n."id";--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "inventory_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "kind" text DEFAULT 'shelf' NOT NULL;--> statement-breakpoint
ALTER TABLE "shelves" ADD COLUMN "levels" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "inventory_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "users" SET "inventory_seq" = coalesce((SELECT max("inventory_number") FROM "items" WHERE "items"."user_id" = "users"."id"), 0);--> statement-breakpoint
CREATE UNIQUE INDEX "items_user_inventory_idx" ON "items" USING btree ("user_id","inventory_number");
