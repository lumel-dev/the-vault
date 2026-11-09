# AGENTS.md

Guía para quien toca el código de The Vault. Cómo se levanta y se despliega está en el
[README](README.md); el sistema visual, en [DESIGN.md](DESIGN.md).

## Comandos

```bash
pnpm dev / build / lint / typecheck / test
pnpm db:generate   # después de tocar src/lib/db/schema.ts
pnpm db:migrate    # aplica drizzle/ a la base del entorno (ENVIRONMENT decide cuál)
```

Antes de dar algo por hecho: `pnpm lint`, `pnpm typecheck`, `pnpm test` con Postgres local
(`tests/README.md`) y, si toca UI, verlo en el browser (las dos vistas, y el celular).

## Stack

Next 16 App Router (RSC + Server Actions, React Compiler) · React 19 · three.js + React Three Fiber
+ drei · Drizzle + `postgres-js` · Auth.js v5 beta (Credentials, JWT, scrypt) · Zod 4 · Tailwind v4
· shadcn/ui estilo `base-nova` (Base UI, no Radix) · dnd-kit (`core` + `sortable`) · sonner.

Sin i18n: textos en castellano inline. Un solo tema, claro (no hay `next-themes`).

## Diseño (impeccable)

El mundo visual ("Mudanza": cemento, cartón kraft, cinta de papel, fibrón, un sticker de color por
tipo) se decidió con impeccable. `PRODUCT.md` tiene la verdad del producto, `DESIGN.md` el sistema
visual y `.impeccable/surfaces/` el contrato de la pantalla principal. Un cambio de UI respeta ese
contrato; uno que lo cambia, lo actualiza.

## Datos

- **Todo se filtra por `userId` de la sesión** (`requireUserId()` en `src/lib/auth/session.ts`).
  Nunca se confía en un id de usuario ni de contenedor que mande el browser: `resolveLevel` en
  `src/lib/actions/items.ts` verifica que el contenedor sea del mismo usuario y ajusta el estante
  a los que tiene.
- **Contenedores** (`shelves`): `kind` es `shelf`, `box` o `cabinet` (`src/lib/containers.ts`) y
  `levels` cuántos estantes tiene (una caja, 1). Cada objeto tiene `level` (0 = arriba). Bajar
  `levels` mueve lo de los estantes que desaparecen al último; borrar un contenedor deja todo sin
  ubicar en el nivel 0.
- **Número de inventario**: sale de `users.inventory_seq` (un contador), no de `max()+1`, para que
  borrar el último no lo libere. Único por usuario.
- **`items` es una sola tabla para todos los tipos.** Lo propio de cada tipo va en `attributes`
  (JSONB, `Record<string, string>`), definido en `src/lib/item-types.ts`. `cleanAttributes`
  descarta todo lo que el tipo no declara.
- **Las tapas no se guardan.** `cover_source` + `cover_ref` (hoy sólo `tmdb` + path) y
  `src/lib/covers.ts` arma la URL. `isValidCover` rechaza URLs completas. `images.unoptimized`
  está a propósito: el optimizador de Next cachearía las tapas en el disco del contenedor.
- **TMDB sólo desde el server** (`src/lib/tmdb.ts`, expuesto por `src/lib/actions/tmdb.ts`): el
  token nunca llega al browser. Las tapas sí se piden desde el browser (TMDB manda CORS `*`, que
  es lo que permite usarlas como textura en WebGL).

## La colección en el browser

La página manda **toda** la colección del usuario (`listItems`), pensada para 100 a 500 objetos.
Búsqueda (`src/lib/search.ts`), filtros y orden (`src/lib/sort.ts`) corren en el cliente: "¿lo
tengo?" contesta sin esperar la red. La URL refleja el estado con `history.replaceState`, sin
pedirle nada al server.

La búsqueda es **exacta primero** (sin acentos ni mayúsculas) y sólo si no encuentra nada pasa a
la difusa por trigramas: con la difusa siempre activa, "lost" traía "Los Soprano". La columna
`items.search_text` con su índice `pg_trgm` quedó de la primera versión, cuando se buscaba en
SQL; hoy no la usa la app.

## Orden y arrastre

- `items.position` es un orden **global por usuario**. Cada estante muestra sus objetos en ese
  orden. Lo nuevo queda primero (`min(position) - 1`).
- `reorderItems(ids)` y `placeItem(id, contenedor, estante, lugar)` **reparten entre los objetos
  tocados las posiciones que ya ocupaban**: lo que no se ve no se mueve. Está cubierto por tests
  de integración; si cambia el modelo de orden, esos tests son el contrato.
- "Acomodar así" (vista Mueble) aplica un orden (`sortItems`) a un contenedor con `reorderItems`:
  cambia el orden guardado, estante por estante, sin cambiar a nadie de estante. En la grilla, un
  orden distinto del propio sólo ordena la vista y apaga el arrastre para reordenar.
- `VaultApp` mantiene una copia local de los items para que mover se vea al instante; se pisa con
  lo que manda el server tras cada action (`revalidatePath("/")`) y vuelve atrás si la action
  falla.
- Grilla: dnd-kit. Los contenedores del riel son droppables con id `shelf:<uuid|none>`.
  `DndContext` lleva `id` fijo: sin él, `aria-describedby` no coincide entre server y cliente.
- Borrar es diferido: el objeto se tacha y `deleteItem` corre a los 5 segundos si no se deshizo.
  Si se cierra la pestaña antes, no se borra (falla para el lado seguro).

## Vista 3D

- `src/lib/scene-layout.ts` es puro: medidas reales de cada objeto (`itemShape`), dónde va cada
  mueble y cada objeto, y los huecos donde se puede soltar (`dropTarget`). Tiene tests; la escena
  sólo dibuja.
- `src/components/vault3d/VaultScene.tsx` se carga con `next/dynamic` sin SSR: la grilla y la
  búsqueda no esperan a three.js. `frameloop="demand"`: sólo se dibuja cuando algo cambia
  (`invalidate()`), por la batería del celular. Sombras sólo con puntero fino (no en touch).
- **Lomos en un atlas** (`buildSpineAtlas`): 512 lomos por textura de 2048 px, cada celda dibujada
  en milímetros del lomo real. Cada objeto tiene su geometría con las UV de la cara del lomo
  apuntando a su celda. Una textura por lomo serían cientos de subidas a la GPU.
- Los materiales compartidos (el plástico negro de las cajas) **no se modifican** para apagar lo
  que no coincide: `dimmed()` usa copias cacheadas.
- Las flechas de búsqueda van fuera del grupo que se anima, en coordenadas del mundo, con el ancho
  del propio lomo: con círculos, los de lomos vecinos se pisaban.
- Arrastre 3D: con mouse arranca a los 6 px; con el dedo, a los 250 ms sin moverse (si no,
  deslizar mueve la cámara). Se proyecta el puntero sobre un plano en el frente de los muebles.
  Dentro del mismo estante, el lugar se cuenta sin el objeto que se mueve.
- El 3D no es accesible por teclado: todo lo que hace tiene equivalente en la grilla.

## Migraciones

- Se generan con `pnpm db:generate` y se commitean en `drizzle/`. **No se usa `db:push`.**
- Corren solas al arrancar el server de producción (`src/instrumentation.ts`).
  `outputFileTracingIncludes` mete `drizzle/` en el bundle standalone.
- Agregar una columna `NOT NULL` a una tabla con datos va en pasos dentro de la migración
  (nullable, backfill, `SET NOT NULL`), como `0002_contenedores_e_inventario.sql`.
- SQL que Drizzle no sabe generar (extensiones, funciones) va en una migración custom:
  `pnpm drizzle-kit generate --custom --name <nombre>`.
- Cambios compatibles hacia atrás (*expand/contract*): un rollback en Coolify vuelve a la imagen
  anterior sin deshacer la migración.

## UI

- Los componentes de `src/components/ui/` vienen de shadcn (`base-nova`). Al agregar uno con el
  CLI, revisar que importe `cn` de `@/lib/utils` y no de un paquete `cn` de npm (el CLI lo hizo
  una vez y lo instaló como dependencia).
- `<select>` nativo (`NativeSelect`) en vez del Select de Base UI: en el celular abre el selector
  del sistema.
- Las filas que se deslizan en el celular usan `no-scrollbar`; las grillas que las contienen usan
  columnas `minmax(0,1fr)` (también el `<nav>` del riel) para que no estiren la página.
- Las fuentes del canvas se leen de las variables de `next/font` (`--font-sans-app`,
  `--font-marker-app`) y el atlas se dibuja después de `document.fonts.ready`.
