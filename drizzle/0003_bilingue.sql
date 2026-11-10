ALTER TABLE "items" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'es' NOT NULL;