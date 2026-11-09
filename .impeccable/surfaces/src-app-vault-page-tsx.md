---
version: 1
slug: "src-app-vault-page-tsx"
primary_target: "src/app/(vault)/page.tsx"
related_targets: ["src/components/vault/VaultBoard.tsx"]
---

# Bóveda (vista principal)

Scope: la pantalla principal `/` (colección), sus diálogos de alta, detalle y contenedor. Modo: Operate.

Audiencia y tarea: el dueño de la colección, cargando en casa frente al mueble, buscando "¿lo tengo?" desde el celular afuera, encontrando en qué estante o caja está algo, y recorriendo la colección para mostrarla.

Restricciones confirmadas: vista 3D de los contenedores reales (estantería abierta, cajas, mueble con puertas o cajones) con los DVDs de lomo hacia afuera, que se deslizan y giran mostrando la tapa al tocarlos. Tiene que haber también una grilla plana para cargar y buscar rápido. La búsqueda es instantánea aunque el 3D tarde, incluso en el celular. Arrastrar entre estantes y cajas tiene que ser tan fácil como en la grilla (mouse, touch, teclado en la grilla). Imágenes sólo de TMDB, nunca guardadas.

Momento memorable: buscar "lost" y ver que el resto de la colección se apaga en su lugar mientras cada lomo de Lost queda señalado con una flecha de fibrón dentro de la Caja 3 (flechas y no círculos, por pedido del usuario: los círculos de lomos vecinos se pisaban).

## Direction contract

THESIS: la colección rotulada como se rotula en casa: cinta de papel escrita con fibrón sobre cada estante y caja, y un sticker circular de color por tipo en cada lomo. Rechaza la grilla oscura de pósters de las apps de colecciones: acá lo que se ve es el mueble.

OWN-WORLD: fondo de cemento claro frío (#d9dad6), barra superior de cartón kraft (#c4935c) con borde corrugado oscuro (#8a6238), riel lateral gris papel (#ecebe7). Cinta de papel (#e8dcb4) con rótulos en Permanent Marker negro (#1c1b19). Stickers: rojo películas (#e2412f), azul series (#2f6fd6), verde libros (#3aa35a), amarillo música (#f2c230), naranja juegos, gris otros. UI en Archivo; el fibrón sólo en rótulos, búsqueda marcada y el logo. Lomos negros y de color, estantería de madera oscura, cajas de cartón con solapas abiertas.

STORY: el visitante reconoce sus muebles, encuentra su DVD por el lomo o por la búsqueda, lo arrastra a otra caja y sabe exactamente dónde quedó.

FIRST VIEWPORT: barra kraft arriba con logo en cinta, búsqueda ancha "¿Lo tengo?", conmutador Mueble/Grilla y botón Agregar. Riel izquierdo de 270px con los contenedores (ícono de su forma, nombre, cantidad) y la leyenda de stickers. Al centro, el 3D: la estantería en perspectiva con sus estantes rotulados con cinta, cajas en el piso con solapas abiertas, el mueble con puertas; el objeto elegido sale de su lugar mostrando la tapa y una ficha dice "CAJA 3 · 3.º lugar".

FORM: candidato 4 de 7 (Mudanza), elevado por: tablero split-flap (filtrar apaga en su lugar, nada se mueve), grilla de Crouwel (huecos visibles al arrastrar), billetera de pasajes (borrar tacha con fibrón y deja deshacer), catálogo Factory (número de inventario correlativo en el lomo), horario en vidrio (lista densa a un solo tamaño). seed:7346328c40b1814d

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
