CREATE TABLE "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"base" text NOT NULL,
	"name" text,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sticker_id" uuid;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stickers_user_idx" ON "stickers" USING btree ("user_id","position");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Cada usuario arranca con los seis stickers de siempre (sin nombre: se muestran con el nombre de
-- su tipo en el idioma del usuario) y cada objeto queda con el de su tipo.
INSERT INTO "stickers" ("user_id", "base", "color", "position")
SELECT u.id, d.base, d.color, d.position
FROM "users" u
CROSS JOIN (VALUES
  ('movie', '#e2412f', 0),
  ('series', '#2f6fd6', 1),
  ('book', '#3aa35a', 2),
  ('music', '#f2c230', 3),
  ('game', '#ef7d22', 4),
  ('other', '#8b8f96', 5)
) AS d(base, color, position);
--> statement-breakpoint
UPDATE "items" i
SET "sticker_id" = s.id
FROM "stickers" s
WHERE s.user_id = i.user_id AND s.base = i.type AND i.sticker_id IS NULL;
