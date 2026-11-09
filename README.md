# The Vault

Una web app para llevar el inventario de lo que tenés y saber dónde está: películas y series en
DVD, libros, música, juegos o cualquier otra cosa. Cada persona tiene su cuenta y su colección.

La colección se ve de dos maneras. **Mueble** es la casa en 3D: tus estanterías, cajas y muebles
con puertas, con cada cosa en su lugar y con su forma real (una caja de DVD de 14 mm, un Blu-ray
más bajo, un vinilo, un libro). Los DVDs se ven de lomo; al tocar uno se desliza afuera y gira
mostrando la tapa. **Grilla** es la vista plana de tapas, para cargar y buscar rápido.

Las tapas no se guardan en ningún lado: se piden en vivo a [TMDB](https://www.themoviedb.org)
con la referencia que guarda la base. Lo que no tiene tapa se ve como una caja negra con el
nombre escrito en una cinta.

Next.js 16 (App Router, React Compiler), three.js con React Three Fiber, Postgres con Drizzle,
Auth.js v5, dnd-kit, Tailwind v4 y shadcn/ui. Está sólo en español.

## Qué trae

- **Contenedores** con forma: estantería abierta (con la cantidad de estantes que tenga), caja y
  mueble con puertas (las puertas se abren solas cuando hay que mirar adentro). Cada uno lleva su
  nombre en una cinta de papel escrita con fibrón. Lo que no está en ningún lado queda en la mesa
  de "Sin ubicar".
- **Tipos de objeto** con sus datos propios: película (formato, año, género, dirección, discos,
  región, edición), serie (lo mismo con temporada), libro, música, videojuego y "otro" (marca y
  modelo). Cada tipo tiene su sticker de color en el lomo.
- **Número de inventario** correlativo por usuario (N.º 0142), escrito en el lomo: sirve para
  anotarlo en el objeto real. No se reutiliza al borrar.
- **Alta desde TMDB**: buscás el título y vienen nombre, año, género, sinopsis, dirección y tapa.
  En una serie elegís la temporada, que tiene su propia tapa. "Agregar y cargar otro" deja el
  lugar y el formato para seguir cargando.
- **Arrastrar**: en el mueble, un lomo se lleva a otro estante o caja y cae en el hueco que marca
  la raya roja; en la grilla, una tapa se suelta sobre un contenedor o entre las demás. En el
  celular se mantiene apretado para arrastrar. Con teclado, en la grilla: espacio levanta,
  flechas mueven, espacio suelta.
- **Búsqueda "¿lo tengo?"**: instantánea, en el browser, por nombre, temporada, dirección, autor,
  marca, descripción o número de inventario, sin importar acentos y tolerando errores de tipeo
  ("matirx" encuentra Matrix). En el mueble, lo que no coincide se apaga en su lugar y cada
  coincidencia queda señalada con una flecha de fibrón; la lista de arriba dice dónde está cada una.
- **Ordenar** por nombre (sin contar "El", "La", "The"…), género, tipo o año. En la grilla ordena
  lo que ves; en el mueble, con un contenedor elegido, "Acomodar así" lo ordena de verdad, estante
  por estante, como se ordena a mano.
- **Sacar de la bóveda** tacha el objeto con fibrón y deja 5 segundos para deshacer.

## Agregar un tipo o un campo

Los tipos y sus campos viven en `src/lib/item-types.ts`. Agregar un campo (por ejemplo "idioma"
a las películas) o un tipo nuevo es sumar una entrada ahí: el formulario, el detalle y la
validación salen de esa definición, y los datos van a una columna JSONB, así que no hace falta
migrar la base. Las medidas reales de cada objeto en 3D están en `src/lib/scene-layout.ts`.

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
- **La colección entera viaja al browser** (búsqueda, orden y 3D corren ahí). Está pensado para
  colecciones de cientos de objetos; con varios miles conviene paginar la grilla y revisar el 3D.
- **El 3D se baja aparte**: la grilla y la búsqueda funcionan aunque el mueble todavía se esté
  armando, también en el celular.
- **Un cambio en `schema.ts` necesita su migración** (`pnpm db:generate`) en el mismo PR: el
  deploy aplica lo que hay en `drizzle/`, no el schema.

Las convenciones del código y el porqué de cada decisión están en [AGENTS.md](AGENTS.md). El
sistema visual está en [DESIGN.md](DESIGN.md).
