---
name: 'Buscahogar'
description: 'Una hoja de mapa topográfico para buscar vivienda: margen sobrio, una leyenda que filtra y datos al milímetro.'
colors:
  surface: '#ffffff'
  surface-dark: 'oklch(20% 0.008 235)'
  surface-raised: '#ffffff'
  surface-raised-dark: 'oklch(24% 0.009 235)'
  surface-sunken: 'oklch(97% 0.004 92)'
  surface-sunken-dark: 'oklch(16% 0.007 235)'
  ink: '#1c1f22'
  ink-dark: 'oklch(92% 0.008 90)'
  ink-muted: 'oklch(50% 0.012 235)'
  ink-muted-dark: 'oklch(70% 0.012 235)'
  rule: '#e4e2dc'
  rule-dark: 'oklch(32% 0.008 235)'
  rule-control: 'oklch(62% 0.01 235)'
  rule-control-dark: 'oklch(56% 0.012 235)'
  primary: '#1f5fa8'
  primary-dark: 'oklch(72% 0.12 252)'
  ink-on-accent: '#ffffff'
  ink-on-accent-dark: 'oklch(20% 0.008 235)'
  focus: '#1f5fa8'
  focus-dark: 'oklch(72% 0.12 252)'
  danger: 'oklch(52% 0.17 27)'
  danger-dark: 'oklch(72% 0.14 25)'
  selection: 'oklch(90% 0.04 252)'
  selection-dark: 'oklch(38% 0.08 252)'
  hatch: '#b0662b'
  hatch-dark: 'oklch(70% 0.11 56)'
typography:
  small:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '0.75rem'
    lineHeight: '1rem'
    fontWeight: 400
  dense:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '0.875rem'
    lineHeight: '1.25rem'
    fontWeight: 400
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1rem'
    lineHeight: '1.5rem'
    fontWeight: 400
  heading-3:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.125rem'
    lineHeight: '1.5rem'
    fontWeight: 600
  heading-2:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.375rem'
    lineHeight: '1.75rem'
    fontWeight: 600
  heading-1:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.75rem'
    lineHeight: '2.25rem'
    fontWeight: 700
    letterSpacing: '-0.01em'
rounded:
  control: '0.25rem'
  panel: '0.375rem'
spacing:
  xs: '0.25rem'
  sm: '0.5rem'
  md: '0.75rem'
  lg: '1rem'
  xl: '1.5rem'
  page: '80rem'
components:
  button:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.ink-on-accent}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 0.75rem'
    height: '2.5rem'
  chip-filter:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.dense}'
    rounded: '{rounded.control}'
    padding: '0 0.75rem'
    height: '2rem'
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.panel}'
    padding: '0.75rem 1rem'
  badge-multi-source:
    textColor: '{colors.ink}'
    typography: '{typography.small}'
    rounded: '{rounded.control}'
    padding: '0 0.375rem'
  map-price-label:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.small}'
    rounded: '{rounded.control}'
    padding: '0 0.375rem'
    height: '1.5rem'
    width: '6rem'
  map-cluster:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.ink-on-accent}'
    typography: '{typography.dense}'
    rounded: '50%'
    size: '2.5rem'
---

# Design System: Buscahogar

## Overview

**Creative North Star: "La Hoja del Mapa Topográfico"**

Cada búsqueda es una hoja del Mapa Topográfico Nacional del IGN (MTN25): un margen sobrio, una
leyenda que filtra y los datos al milímetro. Buscahogar es una herramienta de servicio, no un
escaparate. Habla con voz factual, sin lenguaje comercial: el precio va primero, la densidad es
alta y los filtros se ven siempre. Las referencias de uso son las de Google Flights o Kayak, no las
de un portal inmobiliario.

El sistema se reconoce por lo que no lleva. Una vivienda es una fila fina separada por un filete,
no una tarjeta con una foto grande como unidad de lectura. No hay marginalia cartográfica más allá
de un marco y una trama: el marco del mapa y la trama de la ubicación aproximada. Todo lo demás es
papel, tinta y un único azul.

**Key Characteristics:**

- Papel blanco o, en oscuro, una plancha casi negra; tinta casi negra y un único acento azul.
- Estructura con filetes de 1px y superficies, no con sombras ni tarjetas.
- Controles de alto fijo (40px como mínimo en todo lo que se pulsa) y radios casi rectos.
- Una sola trama (siena) reservada a la ubicación aproximada.
- Cifras tabulares donde se comparan precios, recuentos y fechas.
- Sin movimiento decorativo: solo la respuesta de pulsación y la bandeja de filtros.

## Colors

Una paleta de impresión: papel, tinta, un azul de hidrografía y una trama de siena. Los neutros
llevan un matiz frío de 235° (el gris del papel de plancha); el único cálido es la tinta clara del
tema oscuro. Cada color tiene valor claro y oscuro (sufijo `-dark` en el frontmatter); el tema
oscuro no es una inversión, es una segunda hoja con su propia luminosidad.

### Primary

- **Azul de hidrografía** (`primary`, #1f5fa8 / oklch(72% 0.12 252) en oscuro): el único acento. Enlaces
  subrayados, relleno del botón principal («Aplicar filtros», «Buscar»), marca de la zona dibujada,
  clústeres del mapa, contador de filtros y cursor de texto. También es el color del aro de enfoque
  (`focus`, mismo valor), pero se declara aparte porque cumple otro papel.

### Secondary

- **Siena de trama** (`hatch`, #b0662b / oklch(70% 0.11 56) en oscuro): solo la trama y el contorno de
  la ubicación aproximada de la ficha. Nunca es texto, fondo ni acento.

### Neutral

- **Papel de hoja** (`surface`, #ffffff / oklch(20% 0.008 235)): fondo de página y de los campos.
- **Papel sobrepuesto** (`surface-raised`, #ffffff / oklch(24% 0.009 235)): botones, chips, etiquetas de precio
  del mapa y todo lo que flota sobre él. En claro coincide con el papel; en oscuro es un escalón más claro.
- **Papel hundido** (`surface-sunken`, oklch(97% 0.004 92) / oklch(16% 0.007 235)): estado pulsado y hover
  fino de los controles, marco de la miniatura sin foto (mezclado con un 5% de tinta).
- **Tinta de plancha** (`ink`, #1c1f22 / oklch(92% 0.008 90)): texto principal, bordes que se enfatizan y la
  insignia de varias fuentes.
- **Tinta de leyenda** (`ink-muted`, oklch(50% 0.012 235) / oklch(70% 0.012 235)): ayudas, direcciones, pies
  de mapa y texto secundario.
- **Filete de marco** (`rule`, #e4e2dc / oklch(32% 0.008 235)): el filete de 1px entre filas, bajo la cabecera
  y sobre el pie.
- **Trazo de instrumento** (`rule-control`, oklch(62% 0.01 235) / oklch(56% 0.012 235)): borde de campos, botones,
  chips y marco del mapa; es más firme que el filete porque delimita algo que se pulsa.
- **Papel sobre azul** (`ink-on-accent`, #ffffff / oklch(20% 0.008 235)): texto sobre el relleno azul.
- **Resalte de selección** (`selection`, oklch(90% 0.04 252) / oklch(38% 0.08 252)): fondo del texto seleccionado.
- **Carmín de error** (`danger`, oklch(52% 0.17 27) / oklch(72% 0.14 25)): borde de los paneles de alerta (revisión de la búsqueda en
  lenguaje natural y fallo de cobertura).

### Named Rules

**The One Blue Rule.** El azul de hidrografía es el único acento y señala lo que se puede pulsar o lo
que se ha dibujado. Si algo no es interactivo ni es la zona del usuario, no es azul.

**The Hatch Is Approximate Rule.** La siena de trama significa «ubicación aproximada» y nada más. Se
dibuja como trama y contorno, jamás como texto, fondo ni acento.

**The Two-Weights-of-Line Rule.** El `rule` separa contenido; el `rule-control` rodea controles. No se
usa uno por el otro.

## Typography

**Display Font:** pila del sistema (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif`)
**Body Font:** la misma pila; no se carga ninguna fuente de terceros (la CSP solo admite `font-src 'self'`).

**Character:** una sola familia neutra de sistema, como el rótulo de una hoja técnica. La jerarquía sale
del tamaño y del peso (400, 600, 700), nunca de un cambio de familia.

### Hierarchy

- **Heading 1** (700, 1.75rem, 2.25rem, tracking -0.01em): título de la página («Buscar vivienda», precio principal de la ficha).
- **Heading 2** (600, 1.375rem, 1.75rem): secciones de la ficha y precio de cada fila a partir de 48rem.
- **Heading 3** (600, 1.125rem, 1.5rem): marca «Buscahogar», precio de fila en móvil y precio de la ventana del mapa.
- **Body** (400, 1rem, 1.5rem): texto corrido y campos de formulario (16px, para que iOS no amplíe al enfocar).
- **Dense** (400, 0.875rem, 1.25rem): etiquetas, ayudas, direcciones, chips y cifras de las filas.
- **Small** (400, 0.75rem, 1rem): pie del mapa, insignia de fuentes, etiquetas de estado.

### Named Rules

**The Closed Scale Rule.** La escala es cerrada: seis pasos y nada fuera de ellos. Un tamaño nuevo se añade a
`globals.css` y a este documento, no a un componente.

**The Tabular Figures Rule.** Precios, recuentos y fechas que se comparan entre filas llevan
`font-variant-numeric: tabular-nums`.

## Layout

Una columna de contenido con un contenedor de 80rem (`spacing.page`) centrado y márgenes laterales de 1rem,
1,5rem (desde 40rem) y 2rem (desde 64rem). La cabecera, el contenido y el pie comparten ese contenedor.

La búsqueda es una hoja de dos columnas solo cuando cabe: por debajo de 64rem la lista y el mapa se alternan
con un conmutador («Ver mapa» / «Ver lista»); desde 64rem se ven a la vez, la lista con medida de 48rem a la
izquierda y el mapa a la derecha. Sobre el mapa solo va el recuento; los avisos, la ayuda de teclado y el
vacío del mapa van en el pie, y el marco del mapa queda alineado con la primera caja de la lista. La ficha de
vivienda pasa a dos columnas (contenido de hasta 48rem y panel de 20rem como mínimo) desde 64rem.

Los puntos de ruptura del diseño son 30rem, 48rem y 64rem. Bajo 30rem solo se compactan el relleno y el
hueco de la cabecera: los objetivos de pulsación siguen midiendo 40px a todos los anchos. El ritmo vertical
usa pasos de 0,25 / 0,5 / 0,75 / 1 / 1,5rem; los grupos se agrupan con huecos pequeños y las secciones se
separan con filetes, no con espacio vacío.

### Named Rules

**The Forty-Pixel Floor Rule.** Todo lo que se pulsa mide 40px de alto como mínimo. Los chips de filtro
(32px) y los enlaces auxiliares son la excepción reconocida y cumplen el mínimo de 24px de WCAG 2.5.8.

**The Table Stays a Table Rule.** Las cifras comparables van alineadas y tabulares; el historial de precios
conserva siempre su tabla accesible junto al gráfico.

## Elevation & Depth

Plano. La estructura sale de filetes de 1px y de superficies, no de sombras. Hay dos sombras y las dos son
funcionales: una para lo que flota sobre el mapa y otra para lo que aparece al enfocar. Ningún panel,
tarjeta ni fila proyecta sombra en reposo.

### Shadow Vocabulary

- **Elevada** (`box-shadow: 0 1px 2px 0 var(--shadow-color), 0 2px 6px -1px var(--shadow-color)`): la barra de
  dibujo del mapa y el enlace de salto cuando recibe el foco.
- **Superpuesta** (`box-shadow: 0 4px 8px -2px var(--shadow-color), 0 12px 24px -4px var(--shadow-color)`): la
  ventana emergente de una vivienda en el mapa.

### Named Rules

**The Flat-By-Default Rule.** Las superficies son planas en reposo. Una sombra aparece solo en lo que flota
sobre el mapa o en lo que surge al enfocar; nunca para jerarquizar contenido.

**The Layer Ladder Rule.** Solo hay tres capas z: `map-controls` (10), `sticky-header` (20) y `toast` (40). Un
elemento nuevo reutiliza una de ellas.

## Shapes

Casi rectos. Los controles, chips, etiquetas y miniaturas usan un radio de 0,25rem (`control`); los paneles
de aviso, 0,375rem (`panel`). Los clústeres del mapa son círculos de 40px con un anillo del color del papel.
Los bordes son de 1px, salvo el de 2px del enlace de salto y del anillo de los clústeres, y el trazo de 2px de
la zona dibujada. No hay
lados con un borde de color más grueso que el resto.

## Components

**Preciso y sobrio.** Controles de borde fino y alto fijo, un único relleno de acento para la acción
principal y nada decorativo: se leen como instrumentos técnicos.

### Buttons

- **Shape:** radio casi recto (0,25rem), borde de 1px en `rule-control`, alto mínimo de 2,5rem.
- **Default:** fondo `surface-raised`, texto `ink`, relleno 0,5rem 0,75rem.
- **Primary:** una sola acción por pantalla («Aplicar filtros», «Buscar»): fondo `primary`, texto
  `ink-on-accent`, peso 600; pulsado y con puntero fino se oscurece con una mezcla del acento con la tinta
  (20% y 12%).
- **Hover / Active:** el hover solo con puntero fino (en táctil se queda pegado); pulsado, fondo `surface-sunken`
  y borde `ink`, con una respuesta de escala 0,97 de 100 ms solo con puntero y sin foco de teclado.
- **Focus:** aro global de 2px en `focus` con 2px de separación.

### Chips

- **Style:** chip de filtro aplicado: fondo `surface-raised`, borde `rule-control`, texto `dense`, alto de 2rem,
  con un icono de cierre en `ink-muted`; los chips que no se pueden quitar usan `surface-sunken`.
- **State:** hover fino con borde `ink`; pulsado, fondo `surface-sunken`.

### Cards / Containers

- **Corner Style:** panel de 0,375rem (`panel`); las filas de resultado no tienen caja.
- **Background:** `surface`, sin sombra.
- **Border:** 1px en `rule`; los paneles de alerta (cobertura fallida, filtros no válidos) toman `danger`.
- **Internal Padding:** 0,75rem 1rem.

### Inputs / Fields

- **Style:** borde 1px `rule-control`, fondo `surface`, radio de 0,25rem, alto fijo de 2,5rem sin relleno vertical,
  texto de 1rem. Los numéricos miden 7rem.
- **Focus:** el aro global de 2px.
- **Error / Disabled:** el error se explica con texto (el nombre del filtro y el motivo); nunca solo con color.

### Navigation

- **Cabecera:** estática, con la marca a la izquierda, un único enlace «Buscar» y el selector de tema a la
  derecha (un `fieldset` con tres botones). El tema activo se marca con peso 600, borde de tinta, subrayado
  y un nombre accesible «, activo»: no depende del color.
- **Pasos de la búsqueda:** el paso actual lleva peso 600 y el número relleno de tinta.
- **Paginador:** «anterior» y «siguiente» como enlaces de 2,5rem; el extremo que no existe es texto y
  conserva su sitio.

### Fila de resultado

Una fila fina separada por un filete de 1px. A 320px, miniatura de 6rem y texto a la derecha; desde 48rem,
miniatura de 10rem, datos y precio en una columna fija de 10rem a la derecha. «Disponible en N fuentes» (N de
2 en adelante) lleva borde de tinta, peso 600 y cifras tabulares; «1 fuente» es una línea tenue sin caja.

### Mapa

El marco del mapa es un filete de `rule-control`, sin sombra. Las etiquetas de precio (96×24px) usan
`surface-raised`, peso 600 y cifras tabulares; el clúster es un círculo azul de 40px; la barra de dibujo
(`shadow-raised`) y la ventana emergente (`shadow-overlay`) son lo único que flota.

### Aviso de cobertura

Un panel único de 1px con el aviso (región viva), la frase de refresco y, al final, el enlace «Comprobar de
nuevo». El estado (pendiente, en curso, hecho o fallido) lleva una etiqueta de texto además del borde.

## Do's and Don'ts

### Do:

- **Do** usar `primary` solo para lo interactivo y para la zona que el usuario ha dibujado.
- **Do** separar con filetes de 1px (`rule`) y rodear los controles con `rule-control`.
- **Do** mantener 40px de alto mínimo en todo lo que se pulsa, a todos los anchos (decisión 200).
- **Do** dar cada estado con texto o con peso, además de con color (insignias, pasos, tema activo, estado de cobertura).
- **Do** usar cifras tabulares donde se comparan precios, recuentos y fechas.
- **Do** declarar todo valor de color, tamaño y radio en `globals.css` y reflejarlo aquí; `apps/web/test/design-md.test.ts` lo comprueba.

### Don't:

- **Don't** usar una tarjeta con una foto grande como unidad de lectura de un resultado.
- **Don't** añadir marginalia cartográfica más allá del marco del mapa y la trama de la ubicación aproximada.
- **Don't** usar `hatch` (siena) como texto, fondo ni acento.
- **Don't** proyectar sombra en reposo; las dos sombras son para lo que flota sobre el mapa o surge al enfocar.
- **Don't** añadir movimiento decorativo: solo la respuesta de pulsación (100 ms) y la bandeja de filtros bajo 64rem.
- **Don't** cargar fuentes, iconos ni scripts de terceros, ni usar lados con un borde de color más grueso que el resto.
