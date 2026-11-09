# Guion de la demo

Recorrido completo de Buscahogar en directo, de unos 15 minutos, con lo que hay que enseñar y lo que hay que decir en cada paso. Al final hay una
lista de comprobación y respuestas a las preguntas más probables. Para el vídeo corto está [`VIDEO-SCRIPT.md`](VIDEO-SCRIPT.md).

Las frases entre comillas son orientativas: lo importante son los puntos en negrita de «Qué contar».

## 0. Preparación

### El día antes

- [ ] Repasa las cifras que vas a leer en pantalla. Este guion se comprobó el 2026-11-09, después de volcar en Neon los datos con la
      corrección de la decisión 277.

### Diez minutos antes

- [ ] Abre la demo y haz una búsqueda: Neon suspende la base tras 5 minutos sin uso y la primera petición tarda unos segundos.
- [ ] Pestañas abiertas, en este orden: presentación, [demo](https://buscahogar.vercel.app/), [ficha de ejemplo](https://buscahogar.vercel.app/properties/57f6ee7a-81c9-47d7-9d4f-c31d147a6b58),
      [repositorio](https://github.com/Ignacio27-git/buscahogar) y el fichero `docs/DECISIONS.md` en GitHub.
- [ ] Navegador con la ventana maximizada, zoom al 100 % y tema claro. Con más zoom, el mapa baja y se sale de la pantalla.
- [ ] Cierra notificaciones y pestañas personales.

## 1. Apertura (1 min)

**Pantalla:** diapositivas 1 a 3.

**Qué contar**

- **El problema:** la misma vivienda aparece en varios portales, y comparar precios y anuncios es trabajo del usuario.
- **Qué hace Buscahogar:** reúne ofertas, agrupa las que son la misma vivienda y enlaza siempre con el anuncio original.
- **La regla que condiciona el diseño:** la búsqueda nunca consulta las fuentes en directo. Va contra la base de datos propia, y las fuentes
  solo se consultan desde el proceso de ingesta.

> «Ahora lo enseño funcionando, y después explico cómo está hecho por dentro.»

## 2. Portada (1 min)

**Pantalla:** portada de la demo.

**Qué hacer:** señala los tres pasos de la parte superior (Describe, Revisa, Busca) y el campo de texto.

**Qué contar**

- **Dos formas de buscar:** con una frase o con los filtros clásicos.
- **Qué hay en la demo:** datos reales de Idealista de Granada y de las 12 ciudades más pobladas, por ejemplo Madrid, Barcelona,
  Valencia, Sevilla y Zaragoza.

## 3. Búsqueda en lenguaje natural (2 min)

**Qué hacer:** escribe `Piso en alquiler en Granada hasta 900 € con 2 habitaciones` y pulsa «Convertir en filtros».

**Qué contar**

- **No busca todavía:** primero enseña cómo ha entendido la frase (alquiler, piso, Granada, hasta 900 € y al menos 2 habitaciones) y deja
  corregirlo.
- **Sin modelo de lenguaje:** es un intérprete determinista escrito para el proyecto. No llama a ningún servicio externo, cuesta cero y
  siempre responde igual.
- **Está medido:** acierta 13 de 14 frases que no se usaron para ajustarlo (92,9 %), con un intervalo amplio porque son pocas.
- **La zona solo se elige si el nombre coincide exactamente:** aquí lo dice la propia pantalla («es el único municipio que se llama así»).
  Si hay dudas, ofrece alternativas con «Sin zona» marcada.

**Qué hacer:** cambia un filtro en el formulario, por ejemplo el precio máximo a 1 000, y vuelve a 900. Pulsa «Buscar».

## 4. Resultados (2 min)

**Qué hacer:** señala la URL, los filtros aplicados, la lista y el orden.

**Qué contar**

- **Los filtros viven en la URL:** una búsqueda se puede guardar o compartir. Copia la URL y ábrela en otra pestaña para demostrarlo.
- **Filtros aplicados:** cada uno se quita con su aspa, y «Quitar todos» vuelve al inicio.
- **Cada fila** muestra tipo, operación, superficie, habitaciones, baños, dirección, precio y en cuántas fuentes está disponible.
- **El precio** es el más económico de los anuncios activos de esa vivienda.
- **Orden:** más recientes, precio y superficie. **Paginación:** 24 resultados por página.
- **Sin fotos:** Idealista respondió por escrito que no autoriza el uso de sus imágenes, y se retiraron (decisión 276).

**Qué hacer:** cambia el orden a «Precio: de menor a mayor» para que se vea que la URL cambia.

## 5. Mapa (2 min)

**Qué hacer:** baja hasta el mapa. Pulsa un grupo de marcadores para acercarte y abre una vivienda.

**Qué contar**

- **Marcadores agrupados:** con cientos de viviendas, el mapa se lee por grupos.
- **Recuento:** la búsqueda de Granada da 343 viviendas con ubicación. Puede diferir del total de la lista, porque las que no tienen
  ubicación no salen en el mapa, y la página lo avisa.
- **Las posiciones son aproximadas:** algunas fuentes ofuscan las coordenadas.

**Qué hacer:** pulsa «Dibujar zona», haz clic en cuatro puntos fuera de los marcadores y pulsa «Cerrar».

**Qué contar**

- **Zona a mano:** la lista y el mapa se quedan con lo que hay dentro. En la prueba del guion, con los datos anteriores, pasó de 342 a 184 viviendas.
- **También con teclado:** el mapa se maneja con flechas y «Añadir vértice», y la ayuda de teclado está debajo del mapa.
- **Teselas:** las pide el navegador directamente a OpenStreetMap. Es la única petición externa, no pasa por el servidor y no es una fuente de
  anuncios.

## 6. Ficha de la vivienda (2 min 30 s)

**Pantalla:** la [ficha de Calle Almona del Campillo, 1](https://buscahogar.vercel.app/properties/57f6ee7a-81c9-47d7-9d4f-c31d147a6b58).

**Qué contar, de arriba abajo**

- **Agrupación:** dos anuncios con la misma dirección, planta y superficie, a 1 250 y 1 300 €. Buscahogar los trata como una vivienda y
  muestra el precio más económico, con la marca «Más económico» en su anuncio.
- **Anuncios de origen:** cada uno con precio, número de fotos, fecha en que se vio por última vez, estado y enlace a la fuente.
  La pantalla lo dice: «Agrupamos estos anuncios porque creemos que describen la misma vivienda. Compruébalo en cada fuente».
- **Datos consolidados:** tipo, operación, superficie, habitaciones, baños, planta y dirección. Si los anuncios no coinciden en un dato,
  sale «—» con su leyenda, en lugar de inventarlo.
- **Histórico de precios:** cada cambio de precio crea una versión nueva del anuncio y no se sobrescribe nada. Las fechas son las de
  nuestros barridos, no las de publicación. **En la demo todos los anuncios tienen un solo precio observado**, porque la copia recoge un
  único barrido por zona. Explica el mecanismo; no busques una ficha con cambios.
- **Ubicación:** un círculo de 500 m, sin punto exacto, por las coordenadas ofuscadas.
- **Volver a los resultados** conserva la búsqueda.

## 7. Otras ciudades y cobertura bajo demanda (1 min)

**Qué hacer:** busca `Piso en alquiler en Madrid`. La prueba del guion dio 618 viviendas con ubicación.

**Qué contar**

- **Cobertura:** Granada y 12 ciudades tienen datos porque se barrieron por adelantado, con un tope explícito de peticiones.
- **Cobertura bajo demanda:** si alguien busca un municipio sin datos, la web crea un trabajo en cola con una cuota diaria por cliente, y un
  proceso en segundo plano lo cubre después. La web nunca llama a la fuente.
- **En la demo ese proceso está apagado a propósito,** porque gasta cuota real de la API: la petición se queda en cola. Cuéntalo en lugar
  de enseñarlo.

## 8. Calidad transversal (1 min 30 s)

**Qué hacer y qué contar**

- **Tema claro y oscuro:** cambia al oscuro con el selector de la cabecera y vuelve al claro.
- **Adaptable:** estrecha la ventana o usa el modo móvil de las herramientas de desarrollo. Está diseñada para 320, 768 y 1280 px.
- **Accesibilidad:** pulsa Tab al cargar la página: aparece «Saltar al contenido». La accesibilidad se comprueba con axe en pruebas
  automáticas, en los dos temas y en tres anchos.
- **Sin JavaScript:** según el diseño, todas las páginas funcionan sin él, salvo el mapa y el refresco del aviso de cobertura. Si quieres
  enseñarlo, pruébalo antes de la demo.
- **Otras páginas:** pie con aviso legal, privacidad y cookies; una página 404 propia; y `/api/health`, que responde `{"status":"ok"}`.
- **No indexable:** `robots.txt` bloquea el rastreo, porque es una demo.

## 9. Por dentro (3 min)

**Pantalla:** diapositivas 6 a 10 y el repositorio.

**Qué contar**

- **Arquitectura:** monorepo en TypeScript estricto con pnpm. Un worker en Node.js descarga, normaliza y deduplica; una web en Next.js 16
  consulta; las dos partes solo se comunican por PostgreSQL 17 con PostGIS.
- **Dominio aislado:** `packages/core` no conoce Next ni el ORM, y por eso se prueba sin base de datos.
- **Seguridad:** la web usa dos roles mínimos de base de datos y nunca ve las credenciales de las fuentes. Toda entrada externa se valida
  con Zod. Tiene política de seguridad de contenido y un limitador de peticiones.
- **Modelo de datos:** `listings`, un anuncio de una fuente que no se sobrescribe, y `properties`, la vivienda que los agrupa. Así se puede
  repetir la deduplicación sin gastar cuota.
- **Deduplicación en dos fases:** bloqueo en SQL por proximidad, precio y superficie, y puntuación con estrategias intercambiables. Se
  guarda el desglose por señal de cada decisión.
- **La historia de la decisión 277:** preparando la demo apareció un grupo de 7 habitaciones de un piso compartido. Gracias al desglose
  guardado se vio la causa (la planta no se comparaba y el tipo «otro» se daba por igual) y se corrigió con tests. Abre la decisión 277 en
  `docs/DECISIONS.md` para enseñarlo.
- **Rendimiento:** con un millón de viviendas sintéticas, el peor percentil 95 de la búsqueda es de 199 ms, frente a un objetivo de 500.
- **Pruebas:** unas 5 000 automáticas. Normalización con respuestas grabadas, nunca llamadas reales a la API. La CI pasa lint,
  tipos, tests y compilación en cada cambio.
- **Proceso con IA:** desarrollado con Claude Code. El repositorio guarda 277 decisiones con su alternativa descartada, los prompts y un
  registro de los fallos de la IA. «Ella ejecuta; la dirección y la verificación son mías».

## 10. Límites y cierre (1 min)

**Pantalla:** diapositivas 11 y 12.

**Qué contar**

- **Una sola fuente real:** casi todas las viviendas tienen un único anuncio. Hay un adaptador para Kyero, sin datos en la demo.
- **Sin fotos:** Idealista no autoriza el uso de sus imágenes.
- **Datos fijos:** la demo no tiene proceso en segundo plano.
- **Permiso de datos:** Idealista no ha confirmado si se pueden mostrar sus datos en una demo pública. Por todo esto, se descartó la
  producción real: el proyecto termina en esta demo.

> «Tenéis la demo, el código y la documentación en estos enlaces. Muchas gracias.»

## Lista de comprobación

Marca cada punto cuando lo hayas enseñado o contado.

- [ ] Problema, solución y regla de no consultar fuentes en directo
- [ ] Búsqueda con una frase, revisión y corrección de filtros
- [ ] Intérprete sin modelo de lenguaje y su medición
- [ ] Filtros en la URL y búsqueda compartida
- [ ] Quitar filtros, ordenar y paginar
- [ ] Precio más económico y número de fuentes
- [ ] Motivo de que no haya fotos
- [ ] Mapa: grupos, recuento y posiciones aproximadas
- [ ] Dibujar zona, también con teclado
- [ ] Ficha: agrupación, «Más económico» y enlaces de origen
- [ ] Datos consolidados y «—»
- [ ] Histórico de precios y por qué en la demo hay un solo precio
- [ ] Ubicación aproximada de 500 m
- [ ] Otra ciudad y cobertura bajo demanda
- [ ] Tema oscuro, versión móvil y accesibilidad
- [ ] Páginas legales, 404, `/api/health` y `robots.txt`
- [ ] Arquitectura, dominio aislado y roles de base de datos
- [ ] `listings` frente a `properties`
- [ ] Deduplicación en dos fases y su evidencia
- [ ] Decisión 277
- [ ] Rendimiento, pruebas y CI
- [ ] Proceso con IA y su registro
- [ ] Límites y cierre

## Preguntas probables

**¿Por qué no hacer scraping de los portales?**
La fuente es la API oficial de Idealista, con credenciales y una cuota mensual limitada. Por eso todo el código que pagina tiene un corte
explícito y los tests usan respuestas grabadas.

**¿Por qué no usar un modelo de lenguaje para la búsqueda?**
El intérprete determinista no depende de un servicio externo, no cuesta nada por consulta, responde siempre igual y se puede evaluar con un
corpus. Además, el usuario revisa la interpretación antes de buscar.

**¿Cómo evitáis agrupar dos pisos distintos del mismo edificio?**
Es el error que más se teme: agrupar dos viviendas distintas es peor que no detectar un duplicado. Precio y superficie decaen rápido, el
número de habitaciones es binario, y desde la decisión 277 las plantas distintas y los tipos sin clasificar no se agrupan. Cada decisión
guarda su desglose, para revisarla.

**¿Qué tal funciona la deduplicación?**
En 24 pares construidos a mano, la estrategia por reglas da precisión 0,889, recall 0,800 y F1 0,842. Es una muestra pequeña: orienta, no
demuestra. Con una sola fuente real, casi no hay duplicados que medir en los datos.

**¿Escala?**
Con un millón de viviendas sintéticas, el peor percentil 95 es de 199 ms, gracias a índices propios y a desactivar el JIT de PostgreSQL para
el rol de búsqueda.

**¿Dónde está desplegado y cuánto cuesta?**
La web está en Vercel y la base en Neon, en Frankfurt, los dos en planes gratuitos. No hay proceso de ingesta en la demo.

**¿Qué pasa si busco un municipio sin datos?**
Se crea un trabajo en cola, con un tope diario por cliente y otro global. En producción lo recogería el proceso de ingesta; en la demo está
apagado a propósito para no gastar cuota.

**¿Qué ha hecho la IA y qué has hecho tú?**
La IA ha escrito la mayor parte del código bajo mis instrucciones. Las decisiones, la revisión y la verificación son mías, y todo queda
registrado: 277 decisiones, los prompts y un registro de los fallos de la IA, como el de la decisión 277.

**¿Por qué no hay fotos?**
Idealista respondió por escrito que no autoriza el uso de sus imágenes, así que se retiraron de la web.
