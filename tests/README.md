# Tests

`node:test` + `tsx`, sin framework (el mismo esquema que el resto de los repos de lumel.dev).
Resuelven el alias `@/` por el `tsconfig.json`.

```bash
pnpm test
```

## Unitarios (`tests/unit/`)

Sin base: qué atributos se guardan según el tipo, el subtítulo de las tarjetas, que las tapas sólo
salgan de TMDB, el cliente de TMDB con `fetch` simulado (el token va en el header y nunca en la
URL), la búsqueda del browser (acentos, errores de tipeo, exacta antes que difusa), los órdenes
(nombre sin artículos, género, tipo, año), las medidas reales de cada objeto, el armado de la
escena 3D y dónde cae lo que se suelta, y cómo se dice dónde está algo.

## Integración (`tests/integration/`)

Las **server actions se llaman de verdad** contra un Postgres local, con las migraciones de
`drizzle/` aplicadas igual que al arrancar en producción: que cada usuario vea y toque sólo lo
suyo, el número de inventario (correlativo, por usuario, sin reutilizar), soltar un objeto en un
lugar concreto de un estante, reordenar una parte respetando el lugar de lo que no se ve, cambiar
la cantidad de estantes y borrar contenedores. De la app sólo se reemplaza la sesión (`auth()`),
`revalidatePath` y `server-only`, con `mock.module` de `node:test`: por eso el script lleva
`--experimental-test-module-mocks`.

En local, un contenedor descartable:

```bash
docker run -d --name the-vault-tests -p 55438:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=the_vault_test postgres:17
pnpm test
docker rm -f the-vault-tests
```

**Nunca la base del `.env`**: `base.ts` fija `DATABASE_URL` antes de importar `@/lib/db` y corta
si `TEST_DATABASE_URL` no es localhost, porque los tests vacían las tablas. Sin Postgres local
los de integración se saltean; en la CI (con `CI` definida) fallan.
