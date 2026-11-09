---
name: The Vault
description: Lo que tenés y dónde está, rotulado como se rotula una mudanza.
colors:
  concrete: "#d9dad6"
  paper: "#ecebe7"
  kraft: "#c4935c"
  kraft-dark: "#8a6238"
  tape: "#e8dcb4"
  marker: "#1c1b19"
  marker-red: "#c4321f"
  card: "#ffffff"
  secondary: "#e2e1dc"
  muted: "#e4e3de"
  muted-ink: "#57554f"
  sticker-movie: "#e2412f"
  sticker-series: "#2f6fd6"
  sticker-book: "#3aa35a"
  sticker-music: "#f2c230"
  sticker-game: "#ef7d22"
  sticker-other: "#8b8f96"
  wood: "#4a3c30"
  wood-dark: "#3a2f26"
  case-black: "#161617"
typography:
  headline:
    fontFamily: "Archivo, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Archivo, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  card:
    fontFamily: "Archivo, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.375
  caption:
    fontFamily: "Archivo, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  group-label:
    fontFamily: "Archivo, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.12em"
  marker:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.375
  marker-logo:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.025em"
rounded:
  cover: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  rail: "16.5rem"
components:
  button-primary:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.card}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.marker}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-ghost:
    textColor: "{colors.marker}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  search-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.marker}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 96px 0 40px"
  view-toggle-active:
    backgroundColor: "{colors.marker}"
    textColor: "{colors.card}"
    height: "44px"
    padding: "0 14px"
  view-toggle-inactive:
    backgroundColor: "{colors.card}"
    textColor: "{colors.marker}"
    height: "44px"
    padding: "0 14px"
  top-bar:
    backgroundColor: "{colors.kraft}"
    height: "64px"
    padding: "0 20px"
  rail:
    backgroundColor: "{colors.paper}"
    width: "{spacing.rail}"
  rail-row:
    textColor: "{colors.marker}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  rail-row-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.marker}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  rail-row-drop-over:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.marker}"
    rounded: "{rounded.md}"
  tape-label:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.marker}"
    typography: "{typography.marker}"
    padding: "4px 12px"
  match-count:
    backgroundColor: "{colors.marker-red}"
    textColor: "{colors.card}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  sticker:
    size: "12px"
    rounded: "{rounded.full}"
  item-cover:
    backgroundColor: "{colors.case-black}"
    rounded: "{rounded.cover}"
  item-panel:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "20px"
    width: "320px"
---

# Design System: The Vault

## Overview

**Creative North Star: "La Mudanza"**

The Vault se ve como una casa en plena mudanza vista con buena luz: piso de cemento claro, cajas de cartón kraft con las solapas abiertas, estanterías de madera oscura, y cada estante y cada caja rotulados con un pedazo de cinta de papel escrito con fibrón. No es un catálogo de pósters sobre fondo oscuro; lo que se ve es el mueble, con los DVDs de lomo hacia afuera, en el tamaño real de cada objeto (una caja Amaray mide 14 mm de lomo, una caja de cartón tiene paredes de 10,5 cm y los lomos asoman por arriba).

Es claro a propósito: se usa en casa frente al mueble y afuera, con el celular a plena luz. La interfaz plana (barra, riel, grilla, fichas) es Archivo sobre cemento y papel, sobria y densa; el carácter lo ponen los materiales de la mudanza, que aparecen siempre con el mismo significado: la cinta rotula, el fibrón negro escribe, el fibrón rojo señala, el sticker de color dice el tipo. Filtrar apaga en su lugar y nada se mueve: lo que no coincide se oscurece y se funde con el cemento, lo que coincide queda señalado con una flecha.

La pantalla tiene dos caras del mismo inventario: el **Mueble** (3D, para encontrar y mostrar) y la **Grilla** (plana, para cargar y buscar rápido). Las dos comparten el riel, la búsqueda y el mismo vocabulario de marcas.

**Key Characteristics:**
- Cemento claro de fondo, barra de cartón kraft con borde corrugado oscuro, riel de papel gris.
- Cinta de papel con fibrón como único rótulo de lugar: logo, estantes, cajas, la ficha "dónde está".
- Sticker circular de color por tipo, en el lomo, en la tarjeta, en la leyenda del riel.
- Fibrón rojo sólo para señalar: flecha sobre lo que coincide, cruz sobre lo que se borra, raya en el hueco donde cae lo que se arrastra.
- Objetos a escala real; filtrar oscurece en su lugar, no reordena.

## Colors

Una paleta de materiales de mudanza: neutros fríos de cemento y papel, un solo marrón cálido de cartón, negro de fibrón y un rojo de fibrón que sólo señala; los stickers son la única familia de colores saturados.

### Primary
- **Negro Fibrón** (marker): la tinta de todo. Texto, rótulos en cinta, el botón principal ("Agregar"), el segmento activo del conmutador Mueble/Grilla, el borde de 2px de la búsqueda, el foco.

### Secondary
- **Cartón Kraft** (kraft): la barra superior y las cajas del 3D. También es el `theme-color` del navegador, así el celular pinta su barra de cartón.
- **Kraft Corrugado** (kraft-dark): el borde inferior de 3px de la barra, como el canto corrugado de una caja.
- **Cinta de Papel** (tape): rótulos de estantes y cajas, la ficha de ubicación, la selección de texto, la fila del riel que recibe algo arrastrado y la fila elegida en la lista de coincidencias.

### Tertiary
- **Fibrón Rojo** (marker-red): señalar. El contador de coincidencias en la búsqueda y en cada fila del riel, la flecha sobre cada lomo que coincide, la cruz sobre lo que se está por borrar, el cursor de texto (`caret-color`) y lo destructivo.
- **Stickers** (sticker-movie rojo, sticker-series azul, sticker-book verde, sticker-music amarillo, sticker-game naranja, sticker-other gris): uno por tipo, siempre en un círculo con un filo blanco, nunca como fondo ni como texto.

### Neutral
- **Cemento Claro** (concrete): el fondo de la app y el piso y la niebla del 3D; también el color hacia el que se funden los objetos apagados.
- **Papel Gris** (paper): el riel de contenedores en desktop.
- **Blanco Ficha** (card): fichas, paneles, la búsqueda, la fila activa del riel.
- **Gris Lavado** (secondary, muted): botón secundario y hovers.
- **Tinta Gastada** (muted-ink): cantidades, subtítulos, la línea de ayuda.
- **Madera Oscura** (wood, wood-dark): estanterías y muebles del 3D.
- **Plástico Negro** (case-black): la caja de DVD sin tapa y la mayoría de los lomos.
- Bordes y entradas en negro fibrón translúcido: borde `rgb(28 27 25 / 14%)`, input al 28%, anillo de foco al 55%.

### Named Rules

**La Regla del Fibrón Rojo.** El rojo sólo señala algo concreto: una coincidencia, un borrado pendiente, el hueco donde va a caer un objeto. Nunca decora, nunca es fondo de una superficie, nunca es un botón.

**La Regla del Sticker.** Cada tipo tiene un color y ese color vive sólo en su sticker circular. Si aparece un color saturado que no es un sticker ni el fibrón rojo, sobra.

## Typography

**Body Font:** Archivo (con sans-serif)
**Label Font:** Permanent Marker (con cursive)

**Character:** Archivo es la letra de la interfaz: neutra, compacta, buena para listas densas y números tabulares. Permanent Marker es la mano que escribe sobre la cinta; aparece poco y por eso se lee como rótulo, no como estilo.

### Hierarchy
- **Headline** (700, 1.25rem, tracking -0.025em): el nombre de la vista en la grilla ("Toda la casa"), con la cantidad al lado en 0.875rem regular.
- **Title** (700, 1.125rem, 1.25): el nombre del objeto en su ficha; títulos de vacíos ("La casa está vacía").
- **Body** (400, 0.875rem): filas del riel, botones, formularios. En el celular los inputs suben a 1rem para que el teléfono no haga zoom.
- **Card** (600 y 400, 0.8125rem): nombre y dato de la tarjeta, al mismo tamaño; la jerarquía la da el peso y el color.
- **Caption** (400, 0.75rem): subtítulos, ubicación en la lista de coincidencias, datos de la ficha (`dt`).
- **Group Label** (600, 0.75rem, tracking 0.12em, mayúsculas): sólo los dos encabezados del riel, "Contenedores" y "Stickers".
- **Marker** (400, 1rem en la ficha, 1.25rem en el logo): rótulos en cinta, en mayúsculas cuando nombran un lugar ("CAJA 3 · 3.º LUGAR").

### Named Rules

**La Regla del Fibrón en la Cinta.** Permanent Marker sólo se escribe sobre cinta de papel (o como textura en el 3D: rótulos y lomos de paquetes): logo, rótulos de contenedores, la ficha de ubicación, la tapa vacía. Nunca en botones, títulos, cuerpo ni navegación.

**La Regla del Tamaño Único.** En listas densas (tarjetas, coincidencias, riel) el nombre y el dato van al mismo tamaño o a un paso; se distinguen por peso y por color, no por escala.

## Layout

En desktop la app ocupa la altura de la ventana: barra kraft de 64px arriba, riel de 16.5rem a la izquierda (fondo papel, borde derecho) y el resto para el Mueble o la Grilla. Las capas flotantes del 3D se apoyan en las esquinas con 12-16px de margen: lista de coincidencias arriba a la izquierda (hasta 22rem), ficha del objeto arriba a la derecha (320px), control de acomodar abajo a la derecha, ayuda en una línea abajo a la izquierda.

En el celular la barra se vuelve dos filas (logo y salir; búsqueda a todo el ancho; conmutador y Agregar), el riel se vuelve dos filas que se deslizan con el dedo sin barra de scroll (contenedores como pestañas, tipos como píldoras), el Mueble ocupa el 68% de la altura y la ficha del objeto sube desde abajo como una hoja (hasta 70% de la altura).

La grilla es `auto-fill` de columnas de 7.5rem como mínimo (9rem desde `sm`), con 16px entre columnas y 20px entre filas; las tapas mantienen la proporción 2:3 de una caja de DVD. El ritmo general es de 4px: 8, 10, 16 y 20 son los pasos que se repiten.

**La Regla de la Escala Real.** En el 3D cada objeto mide lo que mide (DVD 14 mm de lomo, libros con grosor y alto propios, estantes de 32 cm de profundidad, cajas de 10,5 cm de pared). Los muebles se dimensionan por lo que contienen, nunca al revés.

## Elevation & Depth

Híbrido: la interfaz plana es casi chata y usa sombras suaves sólo para despegar lo que flota sobre el 3D o lo que se levanta; la profundidad real la pone la escena, con luz hemisférica cálida, una luz direccional que proyecta sombras y niebla del color del cemento que funde el fondo. Todas las sombras son de negro fibrón con opacidad, nunca grises puros ni duras.

### Shadow Vocabulary
- **Fila activa** (`box-shadow: 0 1px 3px rgb(28 27 25 / 16%)`): el contenedor elegido en el riel.
- **Tapa en reposo** (`box-shadow: 0 6px 14px -6px rgb(28 27 25 / 55%)`): cada tapa de la grilla.
- **Tapa levantada** (`box-shadow: 0 22px 40px -12px rgb(28 27 25 / 70%)`): la tarjeta mientras se arrastra (además gira 2°).
- **Capa flotante** (`box-shadow: 0 10px 30px -12px rgb(28 27 25 / 55%)`): lista de coincidencias, control de acomodar, aviso sin resultados.
- **Ficha** (`box-shadow: 0 18px 40px -16px rgb(28 27 25 / 55%)`; en el celular `0 -8px 30px -10px rgb(28 27 25 / 45%)`): el panel del objeto elegido.
- **Cinta** (`box-shadow: 0 1px 2px rgb(0 0 0 / 18%)`): el logo, apenas despegado de la barra.

### Named Rules

**La Regla del Apagón en su Lugar.** Filtrar no mueve nada: lo que no coincide queda donde está, con su color oscurecido al 45%, mezclado 55% con el cemento y al 30% de opacidad. Lo que coincide conserva su material y su flecha.

## Shapes

Formas de objetos reales: rectángulos casi rectos con esquinas apenas redondeadas. Las tapas tienen 3px (el canto de una caja de plástico, con un filo interior negro al 25%); filas, búsqueda y botones de la barra 6px; botones y campos de shadcn 8px; la ficha del objeto 12px (sólo arriba cuando es hoja en el celular). Lo único redondo es el sticker y, en el celular, las píldoras de tipo.

La cinta de papel nunca es un rectángulo: tiene los bordes cortados a mano (`clip-path: polygon(0.4% 6%, 99.6% 0%, 98.8% 50%, 100% 96%, 0% 100%, 1.2% 50%)`) y va pegada torcida, entre -1° y -2°. Los trazos de fibrón (flecha, cruz, raya del hueco) tienen puntas redondeadas y un pulso apenas torcido.

## Components

### Buttons
Directos y oscuros, como un rótulo impreso.
- **Shape:** esquinas suaves (6px en la barra, 8px en el resto).
- **Primary:** fondo negro fibrón, texto blanco, 44px de alto en la barra y 32px en diálogos; al pasar, el negro baja al 80%.
- **Secondary:** gris lavado con texto negro ("Editar" en la ficha); al pasar se oscurece un 5% hacia la tinta.
- **Ghost:** sin fondo; al pasar, gris lavado ("Sacar de la bóveda").
- **Focus:** anillo de 3px del color del foco; al apretar baja 1px.

### Chips
- **Sticker:** círculo de 12px (10px en tarjetas y listas) del color del tipo, con un filo blanco de 1.5px al 70% y una sombra interior abajo.
- **Contador de coincidencias:** pastilla roja con texto blanco semibold tabular ("3 coinciden" en la búsqueda, el número solo y redondo en la fila del riel). Sin coincidencias, la pastilla de la búsqueda pasa a gris lavado.
- **Filtro de tipo:** fila con sticker y nombre en plural; activa en blanco ficha y semibold. En el celular es una píldora con borde.

### Cards / Containers
- **Tarjeta de la grilla:** la tapa a 2:3 con su sombra en reposo, y debajo el nombre (semibold, hasta dos líneas) y una línea con sticker y dato. Al pasar sube 4px; elegida lleva un anillo negro de 3px separado 2px del fondo.
- **Tapa vacía:** plástico negro con el sticker arriba y el nombre escrito en cinta torcida -2°, que es como se rotula en casa algo sin tapa. La app nunca guarda imágenes.
- **Ficha del objeto:** blanco ficha, 20px de padding, 12px de radio. Tapa chica, nombre en Title, tipo y número de inventario en Caption, la cinta "dónde está" torcida -1°, datos en dos columnas y las acciones abajo.
- **Vacíos:** borde de 2px punteado en negro fibrón al 25%, texto centrado y una acción.

### Inputs / Fields
- **Búsqueda de la barra:** blanco ficha, borde de 2px negro fibrón, 44px de alto, lupa a la izquierda, contador y borrar a la derecha, placeholder "¿Lo tengo?". El foco suma un anillo de 3px negro al 30%.
- **Campos de formulario:** shadcn `base-nova`: 32px, borde de input (negro al 28%), radio 8px, anillo de foco al 50%; inválido en rojo.
- **Cursor de texto:** fibrón rojo en todos los campos.

### Navigation
- **Barra superior:** cartón kraft con borde inferior corrugado de 3px; logo en cinta, búsqueda ancha, conmutador Mueble/Grilla, Agregar y usuario.
- **Conmutador Mueble/Grilla:** dos segmentos dentro de un borde negro de 2px; el activo en negro con texto blanco, el inactivo en blanco ficha al 50% sobre el cartón (se lee como un kraft lavado) y al pasar, blanco pleno.
- **Riel:** filas con ícono de la forma del contenedor, nombre y cantidad tabular; la activa en blanco con semibold y sombra leve; al pasar, blanco al 60%. Mientras se arrastra, cada contenedor que acepta se marca con borde punteado y el que está debajo se pinta de cinta con borde negro sólido. El lápiz de editar aparece al pasar o con foco.

### Marcas de fibrón en el 3D
- **Flecha de búsqueda:** una flecha roja trazada a mano, quieta arriba del lugar de cada lomo que coincide, con la punta abajo y al centro. Su ancho sigue al lomo (entre 12 y 30 mm). **Flechas y no círculos, por decisión del usuario:** los lomos miden 14 mm y los círculos de dos vecinos se pisaban sin dejar claro cuál era cuál.
- **Cruz de borrado:** dos trazos rojos sobre el lomo de lo que se está por sacar, mientras dura el deshacer. En la grilla es la misma cruz sobre la tapa y el nombre tachado en rojo; en los diálogos, el botón de confirmar borrado pasa a la variante destructiva (texto rojo sobre rojo al 10%).
- **Hueco al arrastrar:** el estante de destino se tiñe de cinta al 45% y una raya roja vertical marca dónde va a caer.
- **Rótulos:** cinta con bordes cortados y grano, escrita en Permanent Marker negro, pegada al frente de cada estante y caja.

## Do's and Don'ts

### Do:
- **Do** rotular todo lugar (estante, caja, mueble, la ficha "dónde está") con cinta de papel y Permanent Marker en mayúsculas, pegada torcida entre -1° y -2°.
- **Do** marcar el tipo de cada objeto sólo con su sticker circular, con los seis colores fijos.
- **Do** reservar el fibrón rojo para señalar: contador de coincidencias, flecha sobre el lomo, cruz de borrado, raya del hueco.
- **Do** apagar en su lugar lo que no coincide (oscurecido, mezclado con el cemento, al 30%) en vez de esconderlo o reordenarlo.
- **Do** mantener los objetos a escala real y las tapas a 2:3.
- **Do** usar sombras de negro fibrón con opacidad y desplazamiento negativo, como en el vocabulario de Elevation & Depth.

### Don't:
- **Don't** marcar coincidencias con círculos alrededor de los lomos: se pisan en lomos de 14 mm. Se usa la flecha.
- **Don't** usar Permanent Marker fuera de la cinta: ni en botones, ni en títulos, ni en el cuerpo.
- **Don't** convertir la vista principal en una grilla oscura de pósters; el fondo es cemento claro y lo que se ve es el mueble.
- **Don't** usar el rojo como fondo de superficie, color de marca o botón principal; como botón sólo aparece tenue, para confirmar un borrado.
- **Don't** agregar colores saturados fuera de los stickers y el fibrón rojo.
- **Don't** guardar ni subir imágenes propias: las tapas se piden en vivo a TMDB y, sin tapa, se dibuja la caja vacía rotulada.
