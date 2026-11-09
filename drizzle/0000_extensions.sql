-- pg_trgm: búsqueda tolerante a errores de tipeo (índice GIN sobre items.search_text).
-- unaccent: buscar "accion" encuentra "Acción". Las dos son "trusted" desde Postgres 13: las
-- puede crear el dueño de la base, sin superusuario.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
-- unaccent() no es IMMUTABLE (depende del search_path), así que no se puede usar en una columna
-- generada ni en un índice. Esta envoltura fija el diccionario y el esquema, y sí lo es.
CREATE OR REPLACE FUNCTION vault_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
