---
name: 'Buscahogar'
description: 'Una hoja de mapa topográfico para buscar vivienda: margen sobrio, una leyenda que filtra y datos al milímetro.'
colors:
  surface: '#faf8f3'
  surface-dark: 'oklch(20.5% 0.006 70)'
  surface-raised: '#fefdfb'
  surface-raised-dark: 'oklch(24.5% 0.007 70)'
  surface-sunken: 'oklch(95% 0.008 85)'
  surface-sunken-dark: 'oklch(16.5% 0.005 70)'
  ink: '#1e1c19'
  ink-dark: 'oklch(92% 0.012 85)'
  ink-muted: 'oklch(49% 0.014 70)'
  ink-muted-dark: 'oklch(71% 0.014 75)'
  rule: '#e4e2dc'
  rule-dark: 'oklch(32% 0.008 70)'
  rule-control: 'oklch(60% 0.012 70)'
  rule-control-dark: 'oklch(57% 0.012 70)'
  primary: '#1f5fa8'
  primary-dark: 'oklch(72% 0.12 252)'
  ink-on-accent: '#ffffff'
  ink-on-accent-dark: 'oklch(20.5% 0.006 70)'
  focus: '#1f5fa8'
  focus-dark: 'oklch(72% 0.12 252)'
  danger: 'oklch(52% 0.17 27)'
  danger-dark: 'oklch(72% 0.14 25)'
  selection: 'oklch(90% 0.04 252)'
  selection-dark: 'oklch(38% 0.08 252)'
  hatch: '#b0662b'
  hatch-dark: 'oklch(70% 0.11 56)'
  vegetation: 'oklch(47% 0.09 150)'
  vegetation-dark: 'oklch(72% 0.1 150)'
  vegetation-wash: 'oklch(95% 0.022 145)'
  vegetation-wash-dark: 'oklch(27% 0.03 150)'
  primary-wash: 'oklch(95% 0.018 252)'
  primary-wash-dark: 'oklch(27% 0.035 252)'
  danger-wash: 'oklch(95% 0.018 25)'
  danger-wash-dark: 'oklch(27% 0.035 25)'
typography:
  small:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '0.75rem'
    lineHeight: '1rem'
    fontWeight: 400
  dense:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '0.875rem'
    lineHeight: '1.25rem'
    fontWeight: 400
  body:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1rem'
    lineHeight: '1.5rem'
    fontWeight: 400
  heading-3:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.125rem'
    lineHeight: '1.5rem'
    fontWeight: 600
  heading-2:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.375rem'
    lineHeight: '1.75rem'
    fontWeight: 600
  heading-1:
    fontFamily: "var(--font-figtree, system-ui), system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
    fontSize: '1.75rem'
    lineHeight: '2.25rem'
    fontWeight: 700
    letterSpacing: '-0.01em'
rounded:
  control: '0.375rem'
  panel: '0.5rem'
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
    backgroundColor: '{colors.primary-wash}'
    textColor: '{colors.ink}'
    typography: '{typography.dense}'
    rounded: '{rounded.control}'
    padding: '0 0.75rem'
    height: '2rem'
  panel:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.panel}'
    padding: '0.75rem 1rem'
  sort-preset:
    textColor: '{colors.primary}'
    typography: '{typography.dense}'
    padding: '0 0.5rem'
    height: '2.5rem'
  sort-preset-active:
    textColor: '{colors.ink}'
    typography: '{typography.dense}'
    padding: '0 0.5rem'
    height: '2.5rem'
  icon-button:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    height: '2.5rem'
    width: '2.5rem'
  disclosure-summary:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.75rem'
    height: '2.5rem'
  badge-multi-source:
    backgroundColor: '{colors.vegetation-wash}'
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
escaparate, y desde D.19 una herramienta con calidez: el mismo mundo, impreso en papel cálido y con
una letra propia. Habla con voz factual, sin lenguaje comercial: el precio va primero, la densidad es
alta y los filtros se ven siempre. Las referencias de uso son las de Google Flights o Kayak, no las
de un portal inmobiliario.

El sistema se reconoce por lo que no lleva. Una vivienda es una fila fina separada por un filete,
no una tarjeta con una foto grande como unidad de lectura. No hay marginalia cartográfica más allá
de un marco, una trama y un único motivo de curvas de nivel: el marco del mapa, la trama de la
ubicación aproximada y el motivo decorativo junto al título de la búsqueda.
Esa excepción es de D.20 (decisión 235). Todo lo demás es papel cálido, tinta, un azul para lo que se pulsa y un verde para lo que está bien.

**Key Characteristics:**

- Papel cálido (crema, no blanco puro) o, en oscuro, una plancha de carbón cálido; tinta casi negra, un único acento interactivo azul y un verde de estado favorable.
- Estructura con filetes de 1px y superficies, no con sombras ni tarjetas.
- Controles de alto fijo (40px como mínimo en todo lo que se pulsa) y radios algo más amables (0,375 y 0,5rem).
- Una sola trama (siena) reservada a la ubicación aproximada.
- Un único motivo decorativo de curvas de nivel junto al título de la búsqueda, en trazo fino y por debajo de los datos.
- Una sola familia, Figtree autoalojada, con cifras tabulares donde se comparan precios, recuentos y fechas.
- Sin movimiento decorativo: el movimiento solo responde a una acción o anuncia un estado (pulsación, bandeja de filtros, color de los controles, realce de la fila y aparición de los avisos); nada se repite en bucle, no hay paralaje ni movimiento ligado al desplazamiento, y con movimiento reducido todo es instantáneo y la imagen de la fila no se amplía.

## Colors

Una paleta de impresión: papel, tinta, un azul de hidrografía, un verde de vegetación y una trama de
siena. Desde D.19 los neutros llevan un matiz cálido (70-85°: el crema del papel y el carbón del tema
oscuro) en lugar del gris frío de 235°. Cada color tiene valor claro y oscuro (sufijo `-dark` en el
frontmatter); el tema oscuro no es una inversión, es una segunda hoja compuesta aparte, con su propia
luminosidad y lavados más oscuros.

### Primary

- **Azul de hidrografía** (`primary`, #1f5fa8 / oklch(72% 0.12 252) en oscuro): el único acento interactivo. Enlaces
  subrayados, relleno del botón principal («Aplicar filtros», «Buscar»), marca de la zona dibujada,
  clústeres del mapa, contador de filtros y cursor de texto. También es el color del aro de enfoque
  (`focus`, mismo valor), pero se declara aparte porque cumple otro papel. Su lavado (`primary-wash`,
  oklch(95% 0.018 252) / oklch(27% 0.035 252) en oscuro) es el fondo de los chips de filtro aplicados.

### Tertiary

- **Verde de vegetación** (`vegetation`, oklch(47% 0.09 150) / oklch(72% 0.1 150) en oscuro): el estado
  favorable y no interactivo. Texto «Disponible», borde de la insignia de varias fuentes y de la marca
  «Más económico». Nunca va solo: siempre acompaña a un texto que dice lo mismo. Su lavado
  (`vegetation-wash`, oklch(95% 0.022 145) / oklch(27% 0.03 150) en oscuro) es el fondo de esas dos
  marcas. «Último precio más bajo» no se pinta de verde: describe una captura, no un estado.

### Secondary

- **Siena de trama** (`hatch`, #b0662b / oklch(70% 0.11 56) en oscuro): solo la trama y el contorno de
  la ubicación aproximada de la ficha. Nunca es texto, fondo ni acento.

### Neutral

- **Papel de hoja** (`surface`, #faf8f3 / oklch(20.5% 0.006 70)): fondo de página y de los campos. Crema cálido; en oscuro, carbón cálido.
- **Papel sobrepuesto** (`surface-raised`, #fefdfb / oklch(24.5% 0.007 70)): botones, etiquetas de precio
  del mapa, los avisos, el panel de cobertura, los números de los pasos y el panel de precio de la ficha. Un
  escalón más claro que el papel en ambos temas (D.20, decisión 237).
- **Papel hundido** (`surface-sunken`, oklch(95% 0.008 85) / oklch(16.5% 0.005 70)): estado pulsado y hover
  fino de los controles, estado vacío, incidencias de la búsqueda en lenguaje natural y pie de página. La
  miniatura sin foto no lo usa: conserva el tinte de un 5% de tinta sobre el papel (D.17), más claro que la
  página en oscuro.
- **Tinta de plancha** (`ink`, #1e1c19 / oklch(92% 0.012 85)): texto principal, bordes que se enfatizan y la
  insignia de varias fuentes.
- **Tinta de leyenda** (`ink-muted`, oklch(49% 0.014 70) / oklch(71% 0.014 75)): ayudas, direcciones, pies
  de mapa y texto secundario.
- **Filete de marco** (`rule`, #e4e2dc / oklch(32% 0.008 70)): el filete de 1px entre filas, bajo la cabecera
  y sobre el pie.
- **Trazo de instrumento** (`rule-control`, oklch(60% 0.012 70) / oklch(57% 0.012 70)): borde de campos, botones,
  chips y marco del mapa; es más firme que el filete porque delimita algo que se pulsa.
- **Papel sobre azul** (`ink-on-accent`, #ffffff / oklch(20.5% 0.006 70)): texto sobre el relleno azul.
- **Resalte de selección** (`selection`, oklch(90% 0.04 252) / oklch(38% 0.08 252)): fondo del texto seleccionado.
- **Carmín de error** (`danger`, oklch(52% 0.17 27) / oklch(72% 0.14 25)): borde de los paneles de alerta (revisión de la búsqueda en
  lenguaje natural y fallo de cobertura). Su lavado (`danger-wash`, oklch(95% 0.018 25) / oklch(27% 0.035 25)
  en oscuro) es el fondo de esos paneles.

### Named Rules

**The One Blue Rule.** El azul de hidrografía es el único acento interactivo y señala lo que se puede
pulsar o lo que se ha dibujado. Si algo no es interactivo ni es la zona del usuario, no es azul. El
verde de vegetación es un estado favorable no interactivo: va siempre con una señal de texto («Disponible»,
«Más económico») y nunca sobre un enlace ni un botón (enmienda de D.19, decisión 231).

**The Hatch Is Approximate Rule.** La siena de trama significa «ubicación aproximada» y nada más. Se
dibuja como trama y contorno, jamás como texto, fondo ni acento.

**The Two-Weights-of-Line Rule.** El `rule` separa contenido; el `rule-control` rodea controles. No se
usa uno por el otro.

## Typography

**Display Font:** Figtree, autoalojada (`src/fonts/figtree.ts`, `next/font/local`, variable 300-900, licencia OFL), con la pila del sistema de respaldo (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif`)
**Body Font:** la misma familia; no se carga ninguna fuente de terceros (la CSP sigue admitiendo solo `font-src 'self'`).

**Character:** una sola familia geométrica y amable, con cifras tabulares y los glifos del español. La
jerarquía sale del tamaño y del peso (400, 600, 700), nunca de un cambio de familia. El puente es
`--font-sans: var(--font-figtree, system-ui), <pila>` en `@theme static`: si la variable no está, cae a la
pila. Figtree es variable, así que el peso 600 es una cara real (SemiBold). Las páginas independientes
(error global y 429) no cargan la fuente y usan la pila del sistema; en las capturas esa pila se resuelve
a Liberation Sans, que no tiene cara SemiBold y pinta el 600 como 700 (decisión 217, acotada por la 234).

### Hierarchy

- **Heading 1** (700, 1.75rem, 2.25rem, tracking -0.01em): título de la página («Buscar vivienda», precio principal de la ficha).
- **Heading 2** (600, 1.375rem, 1.75rem): secciones de la ficha y tamaño del precio de cada fila a partir de 48rem.
- **Heading 3** (600, 1.125rem, 1.5rem): marca «Buscahogar» (en la cabecera y en la franja de las páginas independientes), tamaño del precio de fila en móvil y precio de la ventana del mapa.
- **Precio de fila** (700 en todos los anchos): desde D.20 el precio de la fila toma el peso del titular mayor y mantiene el tamaño y el interlineado de arriba, de modo que la fila no crece (decisión 236).
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

La cabecera de la búsqueda sigue un único orden, que es también el de lectura y el del DOM (sin `order` en
CSS): título, pasos, caja de texto plegable, barra de herramientas (filtros y ordenación), chips aplicados,
sugerencias de zona, panel de cobertura, aviso del polígono y conmutador de vista. La barra de herramientas
envuelve; con la bandeja de filtros abierta, y desde 64rem con el formulario ya desplegado, la bandeja ocupa
toda la fila y la ordenación baja debajo (decisión 229). Los bloques se separan con un hueco de 1rem.

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

Casi rectos, un paso más amables desde D.19. Los controles, chips, etiquetas y miniaturas usan un radio de 0,375rem (`control`); los paneles
de aviso, 0,5rem (`panel`). Los clústeres del mapa son círculos de 40px con un anillo del color del papel.
Los bordes son de 1px, salvo el de 2px del enlace de salto y del anillo de los clústeres, y el trazo de 2px de
la zona dibujada. No hay
lados con un borde de color más grueso que el resto.

## Components

**Preciso y sobrio.** Controles de borde fino y alto fijo, un único relleno de acento para la acción
principal y nada decorativo: se leen como instrumentos técnicos.

### Buttons

- **Shape:** radio suave (0,375rem), borde de 1px en `rule-control`, alto mínimo de 2,5rem.
- **Default:** fondo `surface-raised`, texto `ink`, relleno 0,5rem 0,75rem.
- **Primary:** una sola acción por pantalla («Aplicar filtros», «Buscar»): fondo `primary`, texto
  `ink-on-accent`, peso 600; pulsado y con puntero fino se oscurece con una mezcla del acento con la tinta
  (20% y 12%).
- **Hover / Active:** el hover solo con puntero fino (en táctil se queda pegado); pulsado, fondo `surface-sunken`
  y borde `ink`, con una respuesta de escala 0,97 de 100 ms solo con puntero y sin foco de teclado. Desde D.21 el color y
  el borde cambian en 150 ms (`--duration-hover`, curva `--ease-enter`); el selector de tema queda fuera y cambia al instante.
- **Focus:** aro global de 2px en `focus` con 2px de separación; nunca transiciona, aparece al instante.

### Chips

- **Style:** chip de filtro aplicado: fondo `primary-wash`, borde `rule-control`, texto `dense`, alto de 2rem,
  con un icono de cierre en `ink-muted`; los chips que no se pueden quitar usan `surface-sunken`.
- **State:** hover fino con borde `ink`; pulsado, fondo `surface-sunken`; el cambio de borde y de fondo dura 150 ms.

### Cards / Containers

- **Corner Style:** panel de 0,5rem (`panel`); las filas de resultado no tienen caja.
- **Background:** `surface-raised`, sin sombra (D.20: los avisos y el panel de cobertura son papel sobrepuesto neutro, no
  `surface`); el estado vacío y las incidencias de la búsqueda en lenguaje natural usan `surface-sunken`. Las alertas conservan `danger-wash`.
- **Border:** 1px en `rule`; los paneles de alerta (cobertura fallida, filtros no válidos) toman `danger`.
- **Internal Padding:** 0,75rem 1rem.

### Inputs / Fields

- **Style:** borde 1px `rule-control`, fondo `surface`, radio de 0,375rem, alto fijo de 2,5rem sin relleno vertical,
  texto de 1rem. Los numéricos miden 7rem.
- **Focus:** el aro global de 2px.
- **Error / Disabled:** el error se explica con texto (el nombre del filtro y el motivo); nunca solo con color.

### Navigation

- **Cabecera:** estática y de una sola fila a todos los anchos, con la marca (enlace a «/») a la izquierda y
  el selector de tema a la derecha (`fieldset` con tres botones de icono: sol, luna y monitor; leyenda «Tema»
  solo para lectores de pantalla). Cada botón mide 40 × 40px y su nombre («Claro», «Oscuro», «Sistema») es
  texto oculto a la vista. El tema activo se marca con un borde de tinta de 2px, una barra de 2px bajo el
  icono y un nombre accesible «Oscuro, activo»: no depende del color. Ya no hay enlace «Buscar».
- **Franja de las páginas independientes:** el error global y la página 429 llevan sobre el bloque centrado
  una franja con la marca «Buscahogar» (`heading-3`, 40px de alto, enlace a «/») y un filete inferior de
  `rule`, como la cabecera de la app. La marca no se pone como línea suelta sobre el título.
- **Pasos de la búsqueda:** el paso actual lleva peso 600 y el número relleno de tinta.
- **Paginador:** «anterior» y «siguiente» como enlaces de 2,5rem; el extremo que no existe es texto y
  conserva su sitio. Los enlaces llevan el hover de enlaces de abajo.

### Enlaces

Todo enlace va en `primary` y subrayado. Con puntero fino, el hover de enlaces (D.21, decisión 240) mezcla el
acento con un 12% de tinta, la misma receta que el botón primario: mezclar hacia la tinta sube el contraste en los dos
temas, y el color cambia en 150 ms. Vale para los enlaces de texto y para el paginador. El enlace de salto aparece al
instante y no lleva hover; en táctil no hay hover. Las reglas de la fila y del enlace vigente de la ordenación
ganan por capa y no cambian de color.

### Movimiento

Siete tokens en `@theme static` (los valores viven en `extensions.motion` del sidecar): `--duration-feedback` (100 ms,
pulsación), `--duration-hover` (150 ms, color de los controles y realce de la fila), `--duration-appear` (200 ms,
aparición de los avisos), `--duration-panel-enter` (250 ms) y `--duration-panel-exit` (200 ms) de la bandeja de
filtros bajo 64rem, y las curvas `--ease-enter` y `--ease-exit`. Con `prefers-reduced-motion: reduce` las cinco duraciones
pasan a 0s desde un único interruptor y la foto de la fila no se amplía (esa regla no existe, no es «cero segundos»).

Transicionan de color los botones, los resúmenes de la bandeja y de la caja de texto, los chips, los enlaces, los enlaces
de ordenación y la fila de resultado; los campos, el selector de tema y el aro de enfoque son instantáneos. Los avisos
(el panel de cobertura o el aviso suelto, las incidencias de la búsqueda, la advertencia de fuentes y el vacío) aparecen
con un fundido de opacidad de 200 ms, sin desplazamiento; las alertas aparecen al instante. El fundido se repite en cada
carga completa de la página, no en una navegación suave sobre lo que ya estaba montado, y nunca deja contenido oculto.

### Ordenación (sort-preset)

Cinco enlaces junto a la etiqueta «Ordenar por», bajo la bandeja de filtros: «Más recientes» (el orden por
defecto, que no ensucia la URL), «Precio: de menor a mayor», «Precio: de mayor a menor», «Superficie: de
mayor a menor» y «Superficie: de menor a mayor». Son enlaces reales de 40px de alto y 0,5rem de relleno
lateral, en `primary` y `dense`. El vigente lleva `aria-current="true"`, tinta, peso 600 y una barra de 2px
bajo el texto, sin subrayado; una combinación fuera de los cinco, como `updated` ascendente en la URL, no
marca ninguno. Con puntero fino, un enlace no vigente muestra una vista previa suave (D.21, decisión 13): el borde
inferior toma `rule-control`, nunca la tinta del vigente, para que se distingan, y el vigente no cambia con el puntero. El
color y el borde duran 150 ms. En la revisión de `?q=` la misma ordenación son cinco opciones de radio.

### Caja de texto plegable (disclosure-summary)

La búsqueda en lenguaje natural es un `<details>` dentro del landmark `search`, plegable a todos los
anchos. El resumen «Describe lo que buscas» es el único texto visible: botón de 40px, borde `rule-control`,
fondo `surface-raised` y peso 600. La etiqueta del campo existe pero queda oculta a la vista, así que el
campo conserva el mismo nombre. Se abre sola en la portada, con `?q=`, con parámetros no válidos y cuando la
zona no se reconoce; en una página de resultados queda cerrada. Su color y su borde transicionan en 150 ms como los de
los botones, sin escala de pulsación.

### Motivo de curvas de nivel

Único momento decorativo del sistema (D.20, decisión 235). Cinco anillos cerrados e irregulares anidados alrededor de una cima,
con el tercero como curva maestra (trazo de 2), en un SVG propio incrustado en la cabecera de la búsqueda
(`contour-motif`, `aria-hidden`, sin foco ni texto). Desde D.21 (decisión 243) el dibujo se encuadra en una caja 5:1
centrada en la cima, de modo que ningún anillo queda cortado en plano por el borde del SVG, y los bordes visibles se
desvanecen con una máscara de alfa en línea (sin color y sin recurso servido). Va junto al título de resultados y solo ahí: ni en la portada con consulta en
lenguaje natural, ni en la ficha, ni en los 404. Es un trazo fino que no reserva espacio (posición absoluta, sin eventos de
puntero), pinta por debajo del título y no cambia ni el alto de la cabecera ni el orden del DOM. El trazo es `rule-control` al
35% de opacidad en claro y `rule` entero en oscuro, para que los dos temas pesen parecido (contraste de línea de 1,49:1 y
1,41:1); a 320px se recorta en lugar de desbordar. No es un dato: el motivo no sustituye ninguna señal.

### Panel de precio de la ficha

El precio de la ficha es un panel elevado neutro (`surface-raised`, borde de `rule`, radio `panel`). A partir de 64rem es una
banda lateral cuyo texto se alinea con la rejilla de datos (sangrado lateral de 1rem compensado con el mismo relleno).
Su filete inferior es de 1px en `rule` y va al ancho de la columna, alineado con los filetes de la lista de fuentes y
igual en claro y en oscuro (D.21, decisión 243): un pseudoelemento con `inset-inline: 1rem` en lugar del borde de la caja,
que sobresalía del sangrado. La banda no cambia de alto ni de fondo.

### Pie de página

Filete superior de `rule` sobre `surface-sunken`, un escalón más hundido que el papel; la atribución de IGN/CNIG y de
OpenStreetMap conserva el contraste AA en ambos temas.

### Estado vacío

El vacío filtrado es un panel de 1px con tres cosas: el estado («Ninguna vivienda coincide con tu
búsqueda.»), una frase que remite a los chips de arriba y una única acción. La acción se llama «Quitar los
demás filtros» si hay un polígono que conservar y «Quitar todos los filtros» en los demás casos; no se
muestra si la fila de chips ya ofrece «Quitar todos», para que nunca haya dos enlaces idénticos. El panel no
repite la lista de filtros y aparece con el fundido de opacidad de 200 ms.

### Fila de resultado

Una fila fina separada por un filete de 1px. A 320px, miniatura de 6rem y texto a la derecha; desde 48rem,
miniatura de 10rem, datos y precio en una columna fija de 10rem a la derecha. «Disponible en N fuentes» (N de
2 en adelante) es la insignia `badge-multi-source`: borde `vegetation`, fondo `vegetation-wash`, texto
`ink`, peso 600 y cifras tabulares; «Disponible en 1 fuente» es una línea tenue con un contorno de 1px en `rule`
(`outline` con desplazamiento negativo, que no añade alto ni sombra), sin el verde.

Desde D.20 la fila gana carácter sin crecer (la altura de cada ancho está fijada por `e2e/components-warmth.spec.ts` con una
tolerancia de 4px): el precio pesa 700 en todos los anchos y no lleva espaciado negativo cuando falta; la
operación («Venta», «Alquiler») es la etiqueta neutra `result-row__operation` en la línea de tipo
(«Piso · Venta»), de peso 400, borde de 1px en `rule`, tamaño `small` y sin tono, con el mismo texto
accesible de antes; y «Sin foto» dibuja una pauta cuadrada interior (`rule`, 1px, a 0,375rem del borde) con el
texto en peso 600 sobre el tinte de D.17. La etiqueta de operación queda fuera del subrayado del enlace.

Desde D.21 (decisión 241), con puntero fino, el fondo de la fila toma `surface-sunken` al pasar el puntero y la foto se
amplía hasta 1,03 dentro de su caja, que la recorta; ninguna caja se mueve. El cambio dura 150 ms. Con movimiento
reducido el fondo cambia al instante y la foto no se amplía; en táctil no hay hover.

### Comparativa de fuentes

En la ficha, cada anuncio activo dice «Disponible» en `vegetation` y el más barato de los activos lleva la
marca «Más económico» con borde `vegetation` y fondo `vegetation-wash`. Desde D.20 ambas llevan delante un icono `check`
decorativo (`currentColor`, trazo de 2) que es una señal más que no depende del color; «Último precio más bajo» no lo
lleva. El texto va siempre; el verde no es la única señal. Los anuncios no activos conservan la tinta apagada.

### Mapa

El marco del mapa es un filete de `rule-control`, sin sombra. Las etiquetas de precio (96×24px) usan
`surface-raised`, peso 600 y cifras tabulares; el clúster es un círculo azul de 40px; la barra de dibujo
(`shadow-raised`) y la ventana emergente (`shadow-overlay`) son lo único que flota.

### Gráfico de precios

La ficha dibuja el historial con dos SVG del mismo modelo, cada uno a escala 1:1 para que el texto de 12px
no se encoja: uno compacto (288 × 160, hasta 24rem) y otro ancho (544 × 192, 34rem) que sustituye al
primero cuando el contenedor mide 34rem o más. Solo uno está en el árbol de accesibilidad; la tabla del
historial sigue junto al gráfico. Las etiquetas del eje x son el inicio, el final y la primera captura de
cada serie; la que se solapa con otra de más prioridad se omite.

### Aviso de cobertura

Un panel único de 1px con el aviso (región viva), la frase de refresco y, al final, el enlace «Comprobar de
nuevo». El estado (pendiente, en curso, hecho o fallido) lleva una etiqueta de texto además del borde. Desde D.21
(decisión 243) la etiqueta lleva delante un marcador cuadrado relleno de 0,375rem, del color del texto: una señal de
forma que la distingue de la etiqueta de operación de la fila, que no lo lleva, sin depender del color ni del grosor
del borde. El panel aparece con el fundido de opacidad de 200 ms, salvo si es una alerta.

## Do's and Don'ts

### Do:

- **Do** usar `primary` solo para lo interactivo y para la zona que el usuario ha dibujado, y `vegetation` solo para un estado favorable que además se dice con texto.
- **Do** separar con filetes de 1px (`rule`) y rodear los controles con `rule-control`.
- **Do** mantener 40px de alto mínimo en todo lo que se pulsa, a todos los anchos (decisión 200), también en botones de icono y enlaces de ordenación.
- **Do** dar a cada control de solo icono un nombre accesible en texto oculto y una señal de estado que no sea el color.
- **Do** dar cada estado con texto o con peso, además de con color (insignias, pasos, tema activo, estado de cobertura).
- **Do** usar cifras tabulares donde se comparan precios, recuentos y fechas.
- **Do** declarar todo valor de color, tamaño y radio en `globals.css` y reflejarlo aquí; `apps/web/test/design-md.test.ts` lo comprueba.

### Don't:

- **Don't** usar una tarjeta con una foto grande como unidad de lectura de un resultado.
- **Don't** añadir marginalia cartográfica más allá del marco del mapa, la trama de la ubicación aproximada y el único motivo de curvas de nivel junto al título de la búsqueda.
- **Don't** usar `hatch` (siena) como texto, fondo ni acento.
- **Don't** pintar de verde un enlace, un botón ni «Último precio más bajo»; el verde no es interactivo.
- **Don't** proyectar sombra en reposo; las dos sombras son para lo que flota sobre el mapa o surge al enfocar.
- **Don't** añadir movimiento decorativo, en bucle, de paralaje o ligado al desplazamiento: solo la pulsación (100 ms), la bandeja de filtros bajo 64rem, el color de los controles y el realce de la fila (150 ms) y la aparición de los avisos (200 ms, solo opacidad); nunca en las alertas ni con movimiento reducido.
- **Don't** cargar fuentes, iconos ni scripts de terceros (Figtree se sirve desde el propio origen; las páginas independientes usan la pila del sistema), ni usar lados con un borde de color más grueso que el resto.
