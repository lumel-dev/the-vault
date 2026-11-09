# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personas que tienen una colección física (sobre todo películas y series en DVD y Blu-ray, también
libros, música, juegos y objetos sueltos) y quieren saber qué tienen y dónde está. Cada persona
tiene su cuenta y su colección separada; no se comparten colecciones entre cuentas.

Los mismos usuarios la usan en cuatro momentos:

- **Cargar la colección**: en casa, frente al mueble, dando de alta muchas cosas de una vez.
- **Ver si ya lo tengo**: afuera, desde el celular (una feria, una tienda), antes de comprar algo
  repetido.
- **Encontrar dónde está**: saber en qué estante o caja está algo para ir a buscarlo.
- **Recorrer y mostrar**: mirar la colección por el gusto de verla, o mostrársela a alguien.

## Product Purpose

The Vault es el inventario de lo que una persona tiene. Tiene éxito cuando la colección cargada
coincide con la real, cuando se responde "¿lo tengo?" en segundos desde el celular, y cuando dice
en qué estante o caja está cada cosa.

## Positioning

No es un catálogo de títulos sino un espejo de los muebles: los objetos están en estantes y
cajas que existen en la casa, y se acomodan arrastrándolos como se acomodan en la realidad.

## Operating Context

- Una colección típica tiene entre 100 y 500 objetos.
- Se usa en desktop (cargar, acomodar) y en el celular (buscar afuera, encontrar en casa).
- Los estantes y cajas son lugares físicos que el usuario nombra (Living, Caja 3).

## Capabilities and Constraints

- Tipos: película, serie (por temporada), libro, música, videojuego y otro (marca y modelo). Los
  campos por tipo están en `src/lib/item-types.ts`.
- Alta desde TMDB para películas y series: nombre, año, sinopsis, dirección y tapa (por
  temporada en las series).
- **Las imágenes nunca se guardan**: se piden en vivo a una API (hoy TMDB). Sin imagen, el objeto
  se muestra genérico según su tipo.
- No hay storage de archivos en la nube.
- Arrastrar ordena dentro de un estante y mueve entre estantes; tiene que andar con mouse, touch
  y teclado.
- Búsqueda sin acentos y tolerante a errores de tipeo.
- Postgres en un VPS propio; deploy con Coolify.

## Brand Commitments

- Nombre: **The Vault**. Interfaz en español rioplatense.

## Evidence on Hand

- Tapas: sólo las de TMDB. No hay fotos propias de objetos ni de muebles.
- No hay testimonios, usuarios ni métricas para mostrar; no inventarlos.

## Product Principles

- **Lo que se ve es lo que hay en la casa.** El lugar de cada cosa en pantalla corresponde a su
  lugar real.
- **Contestar "¿lo tengo?" antes que nada.** Buscar es inmediato desde cualquier pantalla y en el
  celular.
- **Cargar muchas cosas tiene que ser rápido.** El alta no frena a quien tiene cientos de DVDs
  por cargar.
- **Nada se guarda que no sea un dato.** Imágenes por referencia a una API, nunca como archivo.
