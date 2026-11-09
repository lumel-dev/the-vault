# The Vault

Una web app para llevar el inventario de lo que tenés: películas y series en DVD, libros, música,
juegos o cualquier otra cosa. Cada objeto se ve por su tapa, y las tapas se arrastran: entre
ellas para ordenarlas, o sobre un estante para guardarlas ahí. Cada persona tiene su cuenta y su
colección.

Las tapas no se guardan en ningún lado: se piden en vivo a [TMDB](https://www.themoviedb.org)
con la referencia que guarda la base. Lo que no tiene tapa (o no está en TMDB) se muestra con una
tapa genérica del tipo.

Next.js 16 (App Router, React Compiler), Postgres con Drizzle, Auth.js v5, dnd-kit, Tailwind v4 y
shadcn/ui. Está sólo en español.

## Qué trae

- **Tipos de objeto** con sus datos propios: película (formato, año, dirección, discos, región,
  edición), serie (lo mismo con temporada), libro, música, videojuego y "otro" (marca y modelo).
- **Alta desde TMDB**: buscás el título, lo elegís y vienen el nombre, el año, la sinopsis, la
  dirección y la tapa. En una serie elegís además la temporada, que tiene su propia tapa.
- **Estantes**: lugares físicos (Living, Caja 3). Se crean desde la barra lateral; borrarlos deja
  sus objetos en "Sin ubicar".
- **Arrastrar**: en desktop se arrastra con el mouse; en el celular, manteniendo apretada la tapa.
  Con teclado: espacio levanta, flechas mueven, espacio suelta.
- **Búsqueda** por nombre, temporada, dirección, autor, marca o descripción, sin importar
  acentos y tolerando errores de tipeo ("matirx" encuentra Matrix). Se combina con el filtro de
  tipo y de estante, y queda en la URL.

## Agregar un tipo o un campo

Los tipos y sus campos viven en `src/lib/item-types.ts`. Agregar un campo (por ejemplo "idioma"
a las películas) o un tipo nuevo es sumar una entrada ahí: el formulario, el detalle y la
validación salen de esa definición, y los datos van a una columna JSONB, así que no hace falta
migrar la base.

## Levantarlo en local

Necesitás Node 26, pnpm 12 (`npm install -g corepack && corepack enable`) y un Postgres 13 o más
nuevo.

1. `pnpm install`
2. `cp .env.example .env` y completá `DATABASE_URL_DEV`, `ENVIRONMENT=development`,
   `AUTH_SECRET` y `SIGNUP_ENABLED=true`. Para las tapas, también `TMDB_API_TOKEN`.
3. `pnpm db:migrate` para crear las tablas.
4. `pnpm dev` y abrí [http://localhost:3000/registro](http://localhost:3000/registro) para crear
   tu cuenta.

Un Postgres descartable alcanza:

```bash
docker run -d --name the-vault-dev -p 55439:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=the_vault postgres:17
# DATABASE_URL_DEV=postgresql://postgres:postgres@localhost:55439/the_vault
```

## Comandos

```bash
pnpm dev           # server de desarrollo en :3000
pnpm build         # build de producción (output standalone)
pnpm lint          # eslint
pnpm typecheck     # tsc --noEmit
pnpm test          # unitarios + integración (estos piden Postgres, ver tests/README.md)
pnpm db:generate   # escribe la migración SQL de un cambio en src/lib/db/schema.ts
pnpm db:migrate    # aplica las migraciones pendientes a la base del entorno
pnpm db:studio     # Drizzle Studio
```

## Deploy

Corre en un VPS con Coolify, a partir del `Dockerfile`, junto a un Postgres en el mismo VPS. Cada
merge a `main` se despliega solo.

**Las migraciones corren al arrancar el contenedor** (`src/instrumentation.ts`): si una falla, el
server no levanta y Coolify mantiene la versión anterior. El usuario de la base tiene que ser
dueño de la base, porque la primera migración crea las extensiones `pg_trgm` y `unaccent`.

| Variable | Momento | Para qué |
|----------|---------|----------|
| `DATABASE_URL` | Runtime | La base de producción. Sin ella el server no arranca |
| `AUTH_SECRET` | Runtime | Firma las sesiones. Si cambia, todos tienen que volver a entrar |
| `SIGNUP_ENABLED` | Runtime | `true` abre `/registro`. Vacía, nadie puede crear cuentas: abrila para sumar a alguien y cerrala después |
| `TMDB_API_TOKEN` | Runtime | El "API Read Access Token" de TMDB. Sin él no hay búsqueda ni tapas, y todo se carga a mano |
| `TMDB_LANGUAGE` | Runtime | Idioma de títulos y sinopsis. Default `es-MX` |
| `ENVIRONMENT`, `DATABASE_URL_DEV` | Runtime | Sólo para desarrollo: con `development` usa la base de desarrollo y nunca cae en la real |

## Para tener en cuenta

- **Las tapas se piden a TMDB desde el browser de cada usuario**: si TMDB no responde, se ve la
  tapa genérica. La app sólo guarda el path (`/abc.jpg`) y nunca acepta URLs completas.
- **Un cambio en `schema.ts` necesita su migración** (`pnpm db:generate`) en el mismo PR: el
  deploy aplica lo que hay en `drizzle/`, no el schema.
- La búsqueda difusa usa `pg_trgm`. Con colecciones de miles de objetos alcanza y sobra; si
  algún día son cientos de miles, revisar el umbral en `src/lib/queries.ts`.

Las convenciones del código y el porqué de cada decisión están en [AGENTS.md](AGENTS.md).
