# Agregador inmobiliario — contexto del proyecto

TFM. Plataforma que agrega ofertas inmobiliarias de varias fuentes, las normaliza,
detecta anuncios que corresponden a la misma vivienda y ofrece una búsqueda unificada.

Detalle en `docs/ARCHITECTURE.md`. Decisiones y su motivo en `docs/DECISIONS.md`.
Consúltalos antes de proponer cambios estructurales.

## Reglas que no se negocian

**No se consultan las fuentes externas en tiempo de búsqueda.** La búsqueda va siempre
contra nuestra base de datos. Las fuentes se consultan solo desde `apps/ingestion`, de
forma programada o mediante un `coverage_job`. Si una propuesta implica que el servidor de
`apps/web` llame a una API o fuente de datos externa, es incorrecta. Única excepción del lado
del navegador: las teselas del mapa, que el navegador pide directamente a OpenStreetMap (decisión
112). No son una fuente de anuncios, no pasan por nuestro servidor y la CSP solo admite ese host en
`img-src`.

**La cuota de la API de Idealista es limitada y mensual.** Cualquier código que pagine
debe tener corte explícito. Un bucle mal cerrado agota la cuota del mes. Nunca llamar a
la API real desde tests: usar fixtures grabados.

**Credenciales de fuentes solo en `apps/ingestion`; `apps/web` tiene dos credenciales de base de
datos, ambas de alcance mínimo.** (docs/DECISIONS.md, decisión 056, enmienda la 015; decisiones
064/069 del paso 1.13; 076/082 del paso 1.15; 102 del paso 2.5). `apps/web` nunca usa la credencial de
propietario de `apps/ingestion`:

- **Lectura:** rol de PostgreSQL de **solo lectura** — `DATABASE_URL` en `apps/web/.env.local`
  (local) o inyectada por Compose desde `WEB_DATABASE_URL` (contenedor).
- **Escritura restringida (`web_coverage`, pasos 1.13, 1.15 y 2.5):** rol acotado a `INSERT` en
  `coverage_jobs` (1.13), a `SELECT`/`INSERT`/`UPDATE`/`DELETE` en `coverage_client_quota` (cuota
  diaria por cliente, 1.15) y a `INSERT` en `zone_query_signals` (señal de demanda por zona, 2.5,
  sin `SELECT`/`UPDATE`/`DELETE`) — `WEB_COVERAGE_DATABASE_URL` en `apps/web/.env.local` (local) o
  inyectada por Compose (contenedor). Ningún otro `GRANT` sobre ninguna otra tabla.

Ninguna credencial de las fuentes (Idealista u otra) llega nunca a `apps/web`, y ninguna
credencial de ningún tipo se expone como variable `NEXT_PUBLIC_*`.

**`listings` y `properties` son cosas distintas.** `listings` = un anuncio de una fuente.
`properties` = vivienda canónica, agrupación de uno o varios listings. No mezclarlas ni
"simplificar" a una sola tabla: la separación permite reprocesar la deduplicación sin
volver a gastar cuota.

**`listings` no se sobrescribe.** Un cambio de precio genera una versión nueva. De ahí
sale el histórico. Única excepción (decisión 107): un anuncio que lleva 180 días inactivo pasa a
`removed` y se redactan `listing_versions.description`, `listing_versions.raw` y
`listings.thumbnail_url`. Los precios, los campos estructurados y la evidencia de deduplicación
no se tocan, y nada se borra.

## Convenciones

- TypeScript estricto. Nada de `any`; si hace falta, `unknown` y estrechar.
- Toda entrada externa se valida con Zod, incluidos los search params.
- La lógica de dominio vive en `packages/core` y no importa nada de Next ni del ORM.
- `apps/web` y `apps/ingestion` no se importan entre sí. Se comunican por base de datos.
- Identificadores, tipos y nombres de tabla en inglés. Comentarios y documentación en español.
- Los filtros de búsqueda viven en la URL (search params), no en estado de cliente.

## Escollos conocidos

- **App Router, no Pages Router.** Nada de `getServerSideProps` ni `getStaticProps`. Si
  dudas de la API de caché o de los helpers de servidor, consulta la documentación de la
  versión fijada en el `package.json` en lugar de asumir.
  
  **Versión exacta de Next.js: 16.3.4** (fijada en paso 1.1). Esta es una versión estable
  con App Router nativo. Si algo no funciona como se describe en la documentación oficial,
  verifica primero que sea para 16.x.x. Las APIs de cache, streaming, y server actions
  dependen de la versión.
- **Coordenadas ofuscadas.** Algunas fuentes devuelven una ubicación aproximada. El radio
  de bloqueo geográfico no puede ser estrecho hasta comprobarlo con datos reales.
- **Imágenes no comparables por hash exacto.** Cada portal reescala y recomprime. La
  comparación exacta de URL o de fichero no sirve.
- **Mismo bloque ≠ misma vivienda.** Proximidad, superficie y precio similares son
  habituales entre viviendas distintas del mismo edificio. La dirección solo cuenta como
  señal fuerte si es exacta.

## Deduplicación

Dos fases: bloqueo en SQL (candidatos por proximidad, banda de precio y margen de
superficie) y puntuación mediante una `DedupStrategy` intercambiable.

Guardar siempre en `property_listings` la puntuación y **el desglose por señal**, no solo
la decisión final. Es la evidencia para la evaluación del TFM y no se puede reconstruir
después.

Al consolidar una vivienda a partir de varios anuncios, el precio mostrado es el más
económico de los anuncios activos. Una vivienda sin ningún anuncio activo no aparece en la
búsqueda, y su detalle muestra el mínimo de todos (decisión 109).

Prioridad: minimizar falsos positivos. Agrupar dos viviendas distintas es peor que no
detectar un duplicado.

## Tests

Concentrados donde está la lógica, no se persigue cobertura global.

- Normalización: fixtures grabados por fuente, sin red.
- Deduplicación: pares etiquetados, con negativos difíciles (mismo bloque).
- Búsqueda: construcción de consultas y filtros.

## Registro obligatorio al terminar cada tarea

Antes de dar por terminada cualquier tarea, actualiza la documentación. Esto forma parte de
la tarea, no es opcional ni requiere que se te pida.

**Siempre:**

1. `docs/PROMPTS.md` — una entrada con el prompt recibido, el tipo de tarea, la forma de
   especificación y si el resultado fue utilizable sin cambios, con retoques o descartado.
2. `docs/ROADMAP.md` — actualiza el estado del paso correspondiente y rellena su apartado
   de notas con lo relevante. En los pasos de diseño (`D.n`), el fichero es
   `docs/DESIGN-ROADMAP.md`.

**Cuando aplique:**

3. `docs/DECISIONS.md` — si has tomado alguna decisión de arquitectura o de modelado que no
   estuviera ya especificada. Incluye la alternativa descartada y el motivo. Numera
   siguiendo la secuencia existente.
4. `docs/AI-NOTES.md` — si durante la tarea has propuesto o generado algo incorrecto y lo
   has corregido después: método o API inexistente, patrón de una versión anterior del
   framework, código que compilaba pero no hacía lo correcto, contradicción con una regla
   de este fichero. Anótalo aunque lo hayas detectado tú mismo y aunque el resultado final
   sea correcto. Especialmente en ese caso: el fallo intermedio es el dato interesante.
5. `docs/ROADMAP.md`, tabla de desviaciones (la de `docs/DESIGN-ROADMAP.md` en los pasos
   `D.n`) — si el paso no se ha ejecutado como estaba escrito, si ha habido que partirlo,
   reordenarlo o descartarlo.

**Al final de la tarea, informa de qué ficheros de documentación has actualizado.** Si no has
actualizado ninguno más allá de los dos obligatorios, dilo explícitamente.

**Si detectas que una regla de este fichero o de `docs/ARCHITECTURE.md` ha quedado obsoleta
o es incorrecta**, dímelo en lugar de ignorarla en silencio.

Este registro es la fuente del capítulo de proceso de la memoria del TFM. Una entrada breve
y concreta vale más que una extensa. No registres correcciones triviales de sintaxis.