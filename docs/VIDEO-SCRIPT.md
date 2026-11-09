# Guion del vídeo del TFM

Duración prevista: unos 7 minutos. El PDF de requisitos exige capturar la pantalla mientras se explica el proyecto; mostrar la cara es opcional.

## Antes de grabar

- Abre la demo 2 minutos antes y haz una búsqueda: la base se suspende si no se usa y la primera petición tarda.
- Deja tres pestañas listas: presentación, [demo](https://buscahogar.vercel.app/) y [repositorio](https://github.com/Ignacio27-git/buscahogar).
- Usa el tema claro y el zoom del navegador al 100 %, con la ventana maximizada: con más zoom, el mapa baja y queda fuera de la pantalla.
- No pulses la petición de cobertura: en la demo se queda en cola y no se ve ningún resultado.
- Comprueba los dos enlaces de «Ver en Idealista» de la ficha del apartado 4, y que sigue teniendo dos anuncios.

## Cómo grabar

- Alterna diapositivas y web, como indica cada apartado. La web es lo importante: demuestra que la aplicación funciona.
- Graba la ventana del navegador o la pantalla completa, no una sola pestaña, para cambiar de pestaña sin cortes.
- Abre la presentación en una pestaña del mismo navegador, sin modo de pantalla completa.
- Salta las diapositivas 4 y 5: sus capturas de la búsqueda y de la ficha sobran, porque eso se enseña en directo.
- Para dar más peso a la web, añade al apartado 3 algún paso de [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md), como quitar un filtro o cambiar el orden.
- Al terminar, sube el vídeo como público o accesible por enlace: el formulario y el README piden su URL.

## 1. Presentación (0:00, 20 s)

**Pantalla:** diapositiva 1.

> Hola, soy Ignacio Jiménez y este es Buscahogar, mi trabajo de fin de máster: un buscador de vivienda que reúne ofertas de varias fuentes, detecta cuáles son la misma vivienda y te lleva siempre al anuncio original.

## 2. Problema y solución (0:20, 45 s)

**Pantalla:** diapositivas 2 y 3.

> Quien busca piso abre varios portales y se encuentra la misma vivienda repetida. Tiene que comparar a mano, y no sabe qué anuncio es el más barato ni cómo ha cambiado el precio.
>
> Buscahogar reúne las ofertas, agrupa las que son la misma vivienda y enlaza con la fuente. Hay una regla que condiciona todo el diseño: la búsqueda nunca consulta las fuentes en directo, siempre va contra nuestra base de datos. Así es rápida y no gasta la cuota mensual de la API de Idealista.

## 3. Demo: búsqueda (1:05, 1 min 30 s)

**Pantalla:** en la portada de la demo, escribe `Piso en alquiler en Granada hasta 900 € con 2 habitaciones` y pulsa «Convertir en filtros».

> Voy a enseñarlo funcionando. Escribo lo que busco con una frase normal. No hay ningún modelo de lenguaje detrás: es un intérprete determinista, escrito y evaluado para este proyecto.
>
> Y no busca todavía. Primero me enseña cómo lo ha entendido: alquiler, piso, Granada, hasta 900 euros y al menos dos habitaciones. Si algo está mal, lo corrijo aquí.

**Pantalla:** pulsa «Buscar» y señala la URL.

> Los filtros viven en la URL, así que esta búsqueda se puede guardar o compartir.

**Pantalla:** en el mapa, pulsa «Dibujar zona», haz clic en cuatro puntos fuera de los marcadores y pulsa «Cerrar».

> A la derecha, el mapa agrupa los marcadores, y también puedo dibujar a mano la zona que me interesa. La lista y el mapa se quedan solo con lo que hay dentro.

**Pantalla:** cambia al tema oscuro y vuelve al claro.

> La interfaz tiene tema claro y oscuro, se adapta al móvil y su accesibilidad se comprueba con axe.

## 4. Demo: ficha (2:35, 1 min)

**Pantalla:** abre la ficha de [Calle Almona del Campillo, 1](https://buscahogar.vercel.app/properties/57f6ee7a-81c9-47d7-9d4f-c31d147a6b58).

> Esta es la parte central del proyecto. Aquí hay dos anuncios con la misma dirección, planta y superficie, pero con precios distintos: 1 250 y 1 300 euros. Buscahogar los trata como una sola vivienda, muestra el precio más económico y enlaza con ambos anuncios para poder comprobarlo.
>
> También está el histórico de precios: cada cambio de precio crea una versión nueva del anuncio, con la fecha en que nuestro barrido lo observó. En esta copia de la demo cada anuncio tiene un solo precio, porque es una foto de un único barrido. Y la ubicación es un círculo de 500 metros, porque algunas fuentes dan coordenadas aproximadas.

## 5. Arquitectura y modelo (3:35, 1 min)

**Pantalla:** diapositivas 6 y 7.

> Es un monorepo en TypeScript. Un worker descarga, normaliza y deduplica los datos, y una web en Next.js los consulta. Las dos partes solo se comunican por PostgreSQL con PostGIS, y la web nunca tiene acceso a las credenciales de las fuentes.
>
> La decisión de modelado más importante es separar anuncios y viviendas. Un anuncio pertenece a una fuente y no se sobrescribe: cada cambio de precio crea una versión nueva, y de ahí sale el histórico. La vivienda agrupa anuncios en otra tabla, así que puedo repetir la deduplicación sin gastar más cuota.

## 6. Deduplicación (4:35, 1 min)

**Pantalla:** diapositiva 8.

> La deduplicación tiene dos fases. Primero, SQL genera candidatos por proximidad, precio y superficie. Después, una estrategia intercambiable puntúa cada par y guarda el desglose por señal.
>
> El riesgo principal es agrupar dos viviendas distintas, porque en un mismo edificio hay pisos muy parecidos. Comparé dos estrategias sobre 24 pares construidos a mano, y la de reglas salió mejor en recall y F1. Es una muestra pequeña: orienta, no demuestra.
>
> De hecho, preparando esta demo encontré siete habitaciones de un piso compartido agrupadas por error. El desglose guardado me permitió ver la causa, y lo corregí.

## 7. Mediciones y proceso (5:35, 50 s)

**Pantalla:** diapositivas 9 y 10; luego la carpeta `docs` del repositorio.

> Con un millón de viviendas sintéticas, el peor percentil 95 de la búsqueda es de 199 milisegundos, frente a un objetivo de 500. El intérprete acierta 13 de 14 frases reservadas, aunque con un intervalo amplio porque son pocas.
>
> Lo he desarrollado con asistencia de Claude Code, y el proceso está documentado en el repositorio: 277 decisiones con su motivo, los prompts y un registro de los fallos de la IA. Ella ejecuta, pero la dirección y la verificación son mías.

## 8. Límites (6:25, 35 s)

**Pantalla:** diapositiva 11.

> También quiero dejar claros los límites. Solo hay una fuente real, así que la mayoría de las viviendas tienen un único anuncio. Idealista me confirmó por escrito que no puedo usar sus imágenes, y las retiré. Tampoco me ha confirmado si puedo mostrar sus datos en una demo pública. Los datos de la demo son fijos, y por todo esto el proyecto termina aquí, sin pasar a producción.

## 9. Cierre (7:00, 15 s)

**Pantalla:** diapositiva 12.

> Tenéis la demo, el código y toda la documentación en estos enlaces. Muchas gracias.
