# The Vault

Una web app para llevar el inventario de lo que tenés y saber dónde está: películas y series en
DVD, libros, música, juegos o cualquier otra cosa. Cada persona tiene su cuenta y su colección.
Corre en [thevault.lumel.dev](https://thevault.lumel.dev).

La colección se ve de dos maneras. **Mueble** es la casa en 3D: tus estanterías, cajas y muebles
con puertas acomodados en L contra dos paredes, con cada cosa en su lugar y con su forma real (una caja de DVD de 14 mm, un Blu-ray
más bajo, un vinilo, un libro). Los DVDs se ven de lomo; al tocar uno se desliza afuera y gira
mostrando la tapa. **Grilla** es la vista plana, para cargar y buscar rápido: en "Toda la casa"
va separada por contenedor, y se puede ver con tapas grandes, tapas chicas, en lista o como lomos
parados en un estante (con el alto real de cada cosa).

Las tapas no se guardan en ningún lado: se piden en vivo a [TMDB](https://www.themoviedb.org)
con la referencia que guarda la base. Lo que no tiene tapa se ve como una caja negra con el
nombre escrito en una cinta.

Next.js 16 (App Router, React Compiler), three.js con React Three Fiber, Postgres con Drizzle,
Auth.js v5, dnd-kit, Tailwind v4 y shadcn/ui. Está en castellano y en inglés.

## Qué trae

- **Contenedores** con forma: estantería abierta, caja y mueble con puertas (las puertas se abren
  solas cuando hay que mirar adentro). Cada uno lleva su nombre en una cinta de papel escrita con
  fibrón. Lo que no está en ningún lado queda en la mesa de "Sin ubicar".
- **Los estantes se ponen solos.** Las estanterías y los muebles miden 80 cm de ancho: lo que
  guardás llena el estante de arriba y, cuando no entra más, pasa al siguiente; el mueble tiene
  los estantes que hagan falta. Lo nuevo va al final (el último estante con lugar), salvo una
  temporada de una serie que ya está ahí, que va al lado de las otras. Para ponerlo en otro lado
  lo arrastrás en el mueble.
- **Tipos de objeto** con sus datos propios: película (formato, año, género, dirección, discos,
  región, edición), serie (lo mismo con temporada), libro, música, videojuego y "otro" (marca y
  modelo).
- **Stickers propios**: la etiqueta de color de cada cosa, en el lomo y en el riel para filtrar.
  Arrancás con uno por tipo, y podés crear los tuyos (Anime, Clásicos…), renombrarlos, cambiarles
  el color y borrarlos. Cada sticker dice qué es (película, serie, libro…), y eso decide dónde se
  buscan los datos y la tapa y qué campos tiene. Para borrar uno con cosas, pasan a otro del mismo
  tipo.
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
- **Ordenar** por nombre (sin contar "El", "La", "The"…; es el orden de entrada), género, tipo,
  año o el orden propio que armaste arrastrando. En la grilla ordena lo que ves; en el mueble, con un contenedor elegido, "Acomodar así" lo ordena de verdad, estante
  por estante, como se ordena a mano.
- **Temporadas que faltan**: en una serie cargada desde TMDB, la ficha dice cuántas temporadas
  salieron y cuáles no tenés, contando todas las que hay en la casa.
- **Bilingüe (es/en)**: cada usuario elige el idioma con el selector ES/EN de la barra y queda
  guardado en su cuenta. Cambia la interfaz y también título, sinopsis, género y tapa de lo que vino
  de TMDB, al instante: al cargar algo se guardan los dos idiomas (castellano de Latinoamérica e
  inglés). La búsqueda encuentra por el título en cualquiera ("Tiempos violentos" o "Pulp Fiction").
  Libros y discos conservan su título original. Antes de entrar, se usa el idioma del navegador.
- **Sacar de la bóveda** tacha el objeto con fibrón y deja 5 segundos para deshacer.
- **Anda sin señal y se instala** (PWA). Una vez abierta con internet, la bóveda abre igual sin
  conexión: la colección, las tapas ya vistas y el mueble 3D. Lo que cargás, movés o borrás sin
  señal se ve al instante, queda guardado en el dispositivo y se sube solo cuando vuelve la
  conexión; la barra avisa "Sin conexión · 2 cambios por subir". Buscar en TMDB, Open Library o
  MusicBrainz sí necesita internet: sin señal, el formulario se completa a mano. El número de
  inventario de algo cargado sin señal aparece al subirse. Para instalarla: en Android, el menú ⋮
  → "Instalar app" (Chrome muestra el cartel solo pocas veces); en iPhone, Compartir → "Agregar a
  inicio" (Safari nunca lo ofrece).

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
node scripts/icons.mjs  # regenera los íconos de la PWA (public/icons/) desde src/app/icon.svg
```

## Deploy

Corre en un VPS con Coolify, a partir del `Dockerfile`, junto a un Postgres en el mismo VPS. Cada
merge a `main` se despliega solo.

El monitor externo (UptimeRobot) pega a `/api/health`, que responde `ok` sin pedir login ni
tocar la base: avisa si el proceso se cae, no si se cae la base.

**Las migraciones corren al arrancar el contenedor** (`src/instrumentation.ts`): si una falla, el
server no levanta y Coolify mantiene la versión anterior. El usuario de la base tiene que ser
dueño de la base, porque la primera migración crea las extensiones `pg_trgm` y `unaccent`.

| Variable | Momento | Para qué |
|----------|---------|----------|
| `DATABASE_URL` | Runtime | La base de producción. Sin ella el server no arranca |
| `AUTH_SECRET` | Runtime | Firma las sesiones. Si cambia, todos tienen que volver a entrar |
| `SIGNUP_ENABLED` | Runtime | `true` abre `/registro`. Vacía, nadie puede crear cuentas: abrila para sumar a alguien y cerrala después |
| `TMDB_API_TOKEN` | Runtime | El "API Read Access Token" de TMDB. Sin él no hay búsqueda ni tapas, y todo se carga a mano |
| `ENVIRONMENT`, `DATABASE_URL_DEV` | Runtime | Sólo para desarrollo: con `development` usa la base de desarrollo y nunca cae en la real |

## Para tener en cuenta

- **Las tapas se piden a TMDB desde el browser de cada usuario**: si TMDB no responde, se ve la
  tapa genérica. La app sólo guarda el path (`/abc.jpg`) y nunca acepta URLs completas.
- **Las tapas se piden siempre en modo CORS** (`crossOrigin`): TMDB sólo manda el header CORS si
  el pedido trae `Origin`, y una copia cacheada sin él bloquea después la textura del 3D.
- **La colección entera viaja al browser** (búsqueda, orden y 3D corren ahí). Está pensado para
  colecciones de cientos de objetos; con varios miles conviene paginar la grilla y revisar el 3D.
- **El 3D se baja aparte**: la grilla y la búsqueda funcionan aunque el mueble todavía se esté
  armando, también en el celular.
- **El modo sin señal no se prueba con `pnpm dev`**: el service worker sólo se registra en
  producción. Para probarlo, `pnpm build`, copiar `public/` y `.next/static` dentro de
  `.next/standalone/` (lo que hace el `Dockerfile`) y correr `node .next/standalone/server.js`;
  después, cortar el server y recargar.
- **Las capturas del instalador** (`public/screenshots/`, en el manifest) son de una colección
  de muestra cargada en una base local, nunca de una cuenta real. Si cambia mucho la pantalla,
  se rehacen igual: 1080×2400 para el celular y 1920×1080 para la computadora, y el tamaño del
  manifest tiene que coincidir con el de la imagen.
- **Al pasar por el login se borra la colección guardada en ese browser** (en una computadora
  compartida, el siguiente no la ve sin señal). Lo que quedó sin subir se conserva y sube cuando
  entra su dueño.
- **Un cambio en `schema.ts` necesita su migración** (`pnpm db:generate`) en el mismo PR: el
  deploy aplica lo que hay en `drizzle/`, no el schema.

Las convenciones del código y el porqué de cada decisión están en [AGENTS.md](AGENTS.md). El
sistema visual está en [DESIGN.md](DESIGN.md).
