# AGENTS.md

Guía para quien toca el código de The Vault. Cómo se levanta y se despliega está en el
[README](README.md).

## Comandos

```bash
pnpm dev / build / lint / typecheck / test
pnpm db:generate   # después de tocar src/lib/db/schema.ts
pnpm db:migrate    # aplica drizzle/ a la base del entorno (ENVIRONMENT decide cuál)
```

Antes de dar algo por hecho: `pnpm lint`, `pnpm typecheck`, `pnpm test` con Postgres local
(`tests/README.md`) y, si toca UI, verlo en el browser.

## Stack

Next 16 App Router (RSC + Server Actions, React Compiler) · React 19 · Drizzle + `postgres-js` ·
Auth.js v5 beta (Credentials, JWT, scrypt) · Zod 4 · Tailwind v4 · shadcn/ui estilo `base-nova`
(Base UI, no Radix) · dnd-kit (`core` + `sortable`) · sonner.

Sin i18n: textos en castellano inline. Sólo tema oscuro (no hay `next-themes`).

## Datos

- **Todo se filtra por `userId` de la sesión** (`requireUserId()` en `src/lib/auth/session.ts`).
  Nunca se confía en un id de usuario ni de estante que mande el browser: `assertShelf` verifica
  que el estante sea del mismo usuario antes de guardar algo ahí.
- **`items` es una sola tabla para todos los tipos.** Las columnas comunes son columnas; lo propio
  de cada tipo va en `attributes` (JSONB, `Record<string, string>`), definido en
  `src/lib/item-types.ts`. `cleanAttributes` descarta todo lo que el tipo no declara: no se
  guarda JSON arbitrario.
- **Las tapas no se guardan.** `cover_source` + `cover_ref` (hoy sólo `tmdb` + path) y
  `src/lib/covers.ts` arma la URL. `isValidCover` rechaza URLs completas para que nadie pueda
  hacer que la app muestre imágenes de cualquier dominio. `images.unoptimized` está a propósito:
  el optimizador de Next cachearía las tapas en el disco del contenedor.
- **TMDB sólo desde el server** (`src/lib/tmdb.ts`, expuesto por `src/lib/actions/tmdb.ts`): el
  token nunca llega al browser.

## Orden y arrastre

- `items.position` es un orden **global por usuario**, no por estante. Lo nuevo y lo que se mueve
  a un estante queda primero (`min(position) - 1`).
- `reorderItems(ids)` recibe sólo lo visible (un estante, una búsqueda) y **reparte entre esos ids
  las posiciones que ya ocupaban**. Así lo oculto no se mueve. Está cubierto por un test de
  integración; si se cambia el modelo de orden, ese test es el contrato.
- En `VaultBoard`, la detección de colisiones prioriza los estantes bajo el puntero y si no hay
  ninguno usa `closestCenter` sobre las tarjetas. Los estantes son droppables con id
  `shelf:<uuid|none>`.
- La grilla mantiene una copia local de los items para que el arrastre sea instantáneo. Se pisa
  cuando llegan props nuevas del server (cada action hace `revalidatePath("/")`); si la action
  falla, se vuelve al estado anterior.
- `DndContext` lleva `id` fijo: sin él, `aria-describedby` no coincide entre server y cliente y
  React avisa un hydration mismatch.

## Búsqueda

`items.search_text` es una columna generada (nombre, marca, modelo, descripción y atributos, en
minúsculas y sin acentos) con índice GIN de `pg_trgm`. `vault_unaccent` (migración `0000`) existe
porque `unaccent()` no es `IMMUTABLE` y no se puede usar en una columna generada. Cada palabra
tiene que matchear con `LIKE`, o por `word_similarity >= 0.4` si tiene 4 letras o más.

## Migraciones

- Se generan con `pnpm db:generate` y se commitean en `drizzle/`. **No se usa `db:push`.**
- Corren solas al arrancar el server de producción (`src/instrumentation.ts`).
  `outputFileTracingIncludes` mete `drizzle/` en el bundle standalone: sin eso, el contenedor no
  las encuentra.
- Un SQL que Drizzle no sabe generar (extensiones, funciones) va en una migración custom:
  `pnpm drizzle-kit generate --custom --name <nombre>`.
- Cambios compatibles hacia atrás (*expand/contract*): un rollback en Coolify vuelve a la imagen
  anterior sin deshacer la migración.

## UI

- Los componentes de `src/components/ui/` vienen de shadcn (`base-nova`). Al agregar uno con el
  CLI, revisar que importe `cn` de `@/lib/utils` y no de un paquete `cn` de npm (el CLI lo hizo
  una vez y lo instaló como dependencia).
- `<select>` nativo (`NativeSelect`) en vez del Select de Base UI: en el celular abre el selector
  del sistema.
- Las filas que se deslizan en el celular usan la utilidad `no-scrollbar`, y la grilla principal
  usa columnas `minmax(0,1fr)` para que esas filas no estiren la página.
