# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Persona que busca vivienda en España, en compra o alquiler, y que hoy consulta varios portales
por separado. Vuelve a menudo durante semanas, repite búsquedas parecidas y compara precios entre
anuncios y entre visitas. Usa la web tanto en el móvil como en el escritorio.

## Product Purpose

Buscahogar reúne en una sola búsqueda las ofertas de varias fuentes inmobiliarias, las normaliza y
agrupa los anuncios que corresponden a la misma vivienda. El usuario busca una vez, ve cada vivienda
una sola vez con el precio más económico de sus anuncios activos y llega desde la ficha a cada
anuncio de origen.

El éxito es que el usuario deje de recorrer portales uno a uno: que encuentre, compare y descarte
viviendas más rápido y que confíe en que dos resultados distintos son dos viviendas distintas.

Es el producto de un Trabajo Fin de Máster.

## Positioning

Ningún portal individual puede mostrar que una vivienda aparece en varias fuentes ni cuál de ellas
la anuncia más barata. Buscahogar lo hace porque deduplica: separa el anuncio (`listings`) de la
vivienda canónica (`properties`), guarda la puntuación y el desglose por señal de cada
agrupación y prefiere no agrupar a agrupar dos viviendas distintas.

La búsqueda nunca consulta las fuentes en directo: va siempre contra la base de datos propia. Cuando
una zona no tiene datos, el usuario puede pedir que se cubra y un proceso programado la barre.

## Operating Context

- Herramienta de uso frecuente: búsqueda, filtrado y comparación repetidos; la ficha de la vivienda
  es una página de lectura.
- Los filtros viven en la URL: una búsqueda se puede guardar, compartir y volver a abrir.
- Toda página funciona sin JavaScript. El mapa de la búsqueda y el aviso de cobertura en curso son
  las únicas piezas que lo necesitan.
- Móvil y escritorio tienen el mismo peso (anchos de referencia 320, 768 y 1280 px).
- Idioma: español de España.

## Capabilities and Constraints

Disponible hoy:

- Búsqueda sobre la base de datos propia con filtros en la URL, paginación y orden.
- Búsqueda en lenguaje natural: interpreta el texto y pide confirmación antes de buscar; es
  determinista, sin modelo de lenguaje.
- Vista de mapa con agrupación de marcadores y dibujo de una zona a mano.
- Petición de cobertura de un municipio sin datos, con cuota diaria por cliente y aviso del
  estado del barrido.
- Ficha de la vivienda con los datos consolidados, una galería de fotos y la lista de anuncios de
  origen enlazados.
- Histórico de precios en la ficha: gráfico escalonado por anuncio y tabla accesible, con las
  fechas en que nuestro barrido observó cada precio.

Planificado, todavía no construido (no se presenta como existente): ubicación aproximada en la
ficha (D.11) y comparativa entre fuentes (D.12).

Restricciones:

- Hoy solo hay una fuente real, Idealista; casi todas las viviendas tienen un único anuncio.
- No hay cuentas de usuario ni inicio de sesión.
- Algunas fuentes ofuscan las coordenadas: la ubicación de una vivienda es aproximada.
- La política de seguridad de contenido solo admite fuentes tipográficas propias (`font-src 'self'`)
  e imágenes del propio origen y de las teselas de OpenStreetMap (`img-src`). Las fotos de las
  fuentes llegan al navegador a través del optimizador de imágenes propio, no directamente desde
  su CDN. No se cargan fuentes, iconos ni scripts de terceros.
- Una vivienda sin ningún anuncio activo no aparece en la búsqueda; su ficha muestra el mínimo de
  todos sus anuncios.

## Brand Commitments

- Nombre: **Buscahogar**.
- Tono: herramienta factual. Voz de servicio, datos claros y sin lenguaje comercial. Referencias
  elegidas por el responsable: comparadores como Google Flights o Kayak (precio protagonista,
  densidad y filtros visibles).
- Registro: tuteo uniforme en todo el texto de la interfaz.
- Tipografía: pila tipográfica del sistema, sin fuentes propias.
- Dirección general sobria: es una herramienta de uso frecuente con una ficha de lectura.

## Evidence on Hand

- Datos reales de anuncios de Idealista obtenidos por su API, con fotos servidas desde su CDN.
- Nomenclátor de municipios y entidades del IGN/CNIG (licencia CC-BY, atribución obligatoria en el
  pie).
- Investigación de diseño, revisión 2 (`docs/DESIGN-ROADMAP.md`): evidencia C1–C4 sobre la vista
  dividida lista + mapa y la lista primero en móvil, y C9 (secundaria) sobre el histórico de
  precios. Sin evidencia primaria sobre la presentación de la ficha (hueco a).

Ausencias que ningún trabajo posterior debe inventar: no hay logotipo (el icono de D.5, un tejado dentro de un marco, es un glifo funcional de pestaña y de pantalla de inicio, no un logotipo; decisión 149), investigación con usuarios,
métricas de uso, testimonios, cifras de cobertura ni acuerdos con portales.

## Product Principles

1. El precio y los datos comparables mandan; la decoración no compite con ellos.
2. Mostrar la evidencia de la agregación: de qué fuentes sale cada vivienda y cuál es la más
   barata.
3. Honestidad con la incertidumbre: lo aproximado, lo no consolidado y lo inactivo se dicen como
   tales.
4. Nada depende del cliente: la URL es el estado y toda página funciona sin JavaScript.
5. Una herramienta a la que se vuelve cada día: consistencia y densidad antes que efecto.

## Accessibility & Inclusion

Objetivo: WCAG 2.2 AA. La comprobación automática con axe (`wcag22aa`) empieza en el paso D.1,
todavía no construido. Sin desplazamiento horizontal de la página a 320 px. Las atribuciones CC-BY
del IGN/CNIG y de OpenStreetMap siguen visibles y legibles.
