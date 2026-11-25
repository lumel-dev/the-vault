-- Los estantes ya no se eligen: salen de repartir lo de cada mueble, en orden, en estantes de 80 cm
-- (flowShelves). Para que lo que estaba arriba siga arriba, dentro de cada contenedor se reparten
-- las posiciones que ya ocupaban sus objetos en el orden (estante, posición). Después el estante
-- guardado queda en 0: la columna sigue (compatible hacia atrás) pero ya no se lee.
WITH by_place AS (
  SELECT id, user_id, shelf_id,
         row_number() OVER (PARTITION BY user_id, shelf_id ORDER BY level, position, created_at) AS n
  FROM items
  WHERE shelf_id IS NOT NULL
),
slots AS (
  SELECT user_id, shelf_id, position,
         row_number() OVER (PARTITION BY user_id, shelf_id ORDER BY position, created_at) AS n
  FROM items
  WHERE shelf_id IS NOT NULL
)
UPDATE items
SET position = slots.position
FROM by_place
JOIN slots ON slots.user_id = by_place.user_id AND slots.shelf_id = by_place.shelf_id AND slots.n = by_place.n
WHERE items.id = by_place.id AND items.position <> slots.position;
--> statement-breakpoint
UPDATE items SET level = 0 WHERE level <> 0;
