# Rendimiento de la búsqueda (ROADMAP 2.4)

Medición de `buildPropertySearchQuery` (`packages/db/src/search.ts`) antes y después de los índices
de la migración `0012` y de desactivar el JIT para el rol de la búsqueda. Decisiones 100 y 101.
Objetivo del paso: p95 por debajo de 500 ms sobre datos indexados.

## Resultado

**Las 12 combinaciones de la matriz cumplen el objetivo.** El peor p95 final es 199 ms
(`all-filters`); antes había una combinación por encima de 500 ms y cinco entre 230 y 425 ms.

| id | p95 antes | p95 solo índices | p95 índices + JIT desactivado |
|---|---|---|---|
| default | 357.3 | 10.9 | 3.4 |
| op-type | 239.0 | 6.3 | 2.3 |
| price-range-rent | 2.1 | 4.8 | 2.3 |
| price-desc | 334.3 | 4.2 | 2.5 |
| surface-selective | 50.9 | 4.5 | 2.4 |
| surface-sort | 66.5 | 5.3 | 2.8 |
| rooms-baths | 232.0 | 3.2 | 2.0 |
| geo-1km | 84.7 | 137.6 | 110.7 |
| geo-25km-price | 422.8 | **651.4** | 29.0 |
| all-filters | 206.5 | 318.4 | 199.2 |
| deep-default | 395.7 | 54.5 | 27.9 |
| deep-filtered | **510.1** | 61.6 | 27.7 |

Tiempos en milisegundos de reloj del cliente (nunca el `Execution Time` de `EXPLAIN`, que excluye
red y deserialización). La columna intermedia es una medición real con solo los índices; se
conserva porque muestra que los índices no bastaban: `geo-25km-price` quedaba por encima del
objetivo por el JIT, no por falta de índice.

## Método

- **Datos:** 1.000.000 de viviendas sintéticas (1.350.358 anuncios, con sus versiones y su tabla
  de relación) en una base de datos separada, `buscahogar_bench`, 1,9 GB. Generadas con SQL masivo
  (`pnpm --filter @buscahogar/ingestion gen-corpus`, seed 20240229, anchor 2026-09-29) en 228 s. 60%
  en un radio de 25 km del centro de Madrid, 40% repartido por la península; ~2% sin ubicación.
  Ninguna llamada a fuentes externas.
- **Consulta:** la función de producción real; el `EXPLAIN` se hace sobre su `.toSQL()`, con los
  mismos parámetros, así que el SQL medido es el que ejecuta `apps/web`.
- **Por combinación:** una ejecución en frío (`pg_buffercache_evict` por búfer, solo sobre esta base
  de datos), una de calentamiento descartada, 20 en caliente (p50/p95 por rango más cercano) y un
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
- **Entorno:** PostgreSQL 17 + PostGIS 3.5 en Docker Desktop sobre Windows (WSL2),
  `shared_buffers` 128 MB, `max_parallel_workers_per_gather` 2. El "frío" vacía los búferes
  compartidos, no la caché de páginas de WSL2.
- **Índices candidatos:** cada uno se creó a mano en la base de banco, se midieron solo sus
  combinaciones y se borró antes del siguiente. Solo se entregan los que el plan usa y que mejoran
  el p95 de forma clara.

Comandos (desde `apps/ingestion`, sin `--` entre el script y sus opciones):

```sh
pnpm gen-corpus --database-url <url _bench> --rows 1000000 --seed 20240229 --anchor 2026-09-29T00:00:00Z
pnpm bench-search --database-url <url _bench> --runs 20 --cold-mode evict
pnpm bench-report --input .bench/after-full.json --baseline .bench/before-full.json --out ../../docs/SEARCH-PERFORMANCE.md
```

## Índices candidatos

p95 en ms, antes → con el índice, midiendo solo las combinaciones afectadas.

| Candidato | Efecto medido | Resultado |
|---|---|---|
| C1 `(updated_at DESC NULLS LAST, id)` | default 357→3,7; deep-default 396→134; rooms-baths 232→3,1; surface-selective 51→3,5 | entregado |
| C2 `(operation, property_type, updated_at DESC NULLS LAST, id)` | op-type 239→4,1 | entregado |
| C3 `(operation, property_type, min_price_cents, id)` | deep-filtered 510→60 (pasa a cumplir) | entregado |
| C4 `(min_price_cents DESC NULLS LAST, id)` | price-desc 334→3,7 | entregado |
| C5 `(surface_m2, id)` | surface-sort 66→3,2; solo, empeora surface-selective 51→165, pero junto a C1 el planificador usa C1 | entregado |
| C6 `(rooms)` | rooms-baths 232→325 (peor) | descartado |
| C7 `(bathrooms)` | rooms-baths 232→290 (peor) | descartado |

Todos siguen la forma exacta del `ORDER BY` (`col dir NULLS LAST, id ASC`). Un btree ascendente
recorrido hacia atrás da `NULLS FIRST`, así que no sirve para `DESC NULLS LAST` aunque la columna
sea `NOT NULL`: por eso C1 y C4 declaran el orden explícitamente. Con los índices, las
combinaciones que ordenan pasan de `Seq Scan` + `Sort` sobre 1M filas a un `Index Scan` que se
detiene en la fila 25.

Coste: ~230 MB de índices sobre 1M de viviendas, y cinco índices más que mantener en cada escritura
de `properties` durante la consolidación.

## El JIT, no un índice, era el problema de `geo-25km-price`

Con los índices, `geo-25km-price` empeoró hasta un p95 de 651 ms. Su plan recorre
`properties_min_price_cents_idx` en orden de precio y filtra con `ST_DWithin`: el trabajo real es
de ~50 ms. Pero el planificador estima 100 filas dentro del radio cuando en realidad cae el 60% del
corpus, el coste estimado sube a 1,37M y activa el JIT con inlining y optimización. El `EXPLAIN`
lo muestra: **557 ms de compilación** (inlining 204, optimización 215, emisión 136).

Medido con la misma sesión, JIT activado frente a desactivado (p50): `geo-25km-price` 435 → 52 ms;
`geo-1km` 106 → 116 ms; `all-filters` 204 → 183 ms. La búsqueda devuelve 25 filas por página y
nunca se beneficia del JIT, así que se desactiva solo para `web_readonly` en la base `buscahogar`
(`packages/db/sql/bootstrap-roles-grants.sql`, decisión 101). La medición final reproduce ese
ajuste con `ALTER DATABASE buscahogar_bench SET jit = off`, porque el banco conecta como
propietario; después se restauró.

## Límites y avisos

- **`geo-1km` y `all-filters` no usan ningún índice nuevo** y quedan peor que en la medición
  "antes" (85 → 111 ms y 207 → 199 ms). Se comprobó quitando los cinco índices: sin ellos,
  `geo-1km` mide igual (~136 ms), así que la diferencia es deriva del entorno entre sesiones, no
  efecto de los índices. En `all-filters` el planificador añade `properties_surface_m2_id_idx` al
  `BitmapAnd`, lo que cuesta unos 30 ms más que sin él; sigue muy por debajo del objetivo.
- **`properties_operation_property_type_idx` (decisión 051) queda redundante**: C2 y C3 empiezan
  por las mismas dos columnas. Se mantiene en este paso; eliminarlo es un seguimiento.
- **La estimación geográfica es mala** (100 filas estimadas frente a ~600.000 reales). Desactivar
  el JIT quita el síntoma que más dolía, pero el planificador sigue eligiendo con una cardinalidad
  equivocada. Es un seguimiento, no se ha tocado.
- **Datos sintéticos:** las distribuciones son plausibles pero no reales. Con el corpus real
  (~100 viviendas) ninguna de estas conclusiones sería medible, que es el motivo de la decisión 060.
- **Invariante de la base de desarrollo:** `listings` 1, `listing_versions` 1, `properties` 0,
  `property_listings` 0, antes y después de todo el procedimiento de banco (tareas 3.1 y 4.7).

## Tabla antes/después generada

Generada con `bench-report` (antes: sin índices nuevos y JIT por defecto; después: índices de la
0012 y JIT desactivado).

| id | descripción | p50 antes → después (ms) | p95 antes → después (ms) | frío antes → después (ms, método) | objetivo 500 ms | plan |
|---|---|---|---|---|---|---|
| default | Orden por defecto (updatedAt desc), sin filtros, página 1. | 338.9 → 2.1 | 357.3 → 3.4 | 364.1 (evict) → 12.1 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_updated_at_id_idx, property_listings_property_id_idx, listings_pkey) |
| op-type | Filtro de operación (venta) y tipo (piso). | 229.8 → 2.1 | 239.0 → 2.3 | 242.0 (evict) → 3.6 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_operation_property_type_updated_at_idx, property_listings_property_id_idx, listings_pkey) |
| price-range-rent | Alquiler con banda de precio, orden por precio ascendente. | 1.8 → 2.1 | 2.1 → 2.3 | 2.8 (evict) → 3.7 (evict) | cumple | Limit → Result → Incremental Sort → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_min_price_cents_idx, property_listings_property_id_idx, listings_pkey) |
| price-desc | Orden por precio descendente, sin filtros. | 323.1 → 1.9 | 334.3 → 2.5 | 328.1 (evict) → 3.2 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_min_price_cents_desc_id_idx, property_listings_property_id_idx, listings_pkey) |
| surface-selective | Filtro de superficie mínima muy selectivo (≥300 m²). | 46.0 → 2.1 | 50.9 → 2.4 | 47.7 (evict) → 4.5 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_updated_at_id_idx, property_listings_property_id_idx, listings_pkey) |
| surface-sort | Banda de superficie media, orden por superficie ascendente. | 55.4 → 1.8 | 66.5 → 2.8 | 53.4 (evict) → 3.7 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_surface_m2_id_idx, property_listings_property_id_idx, listings_pkey) |
| rooms-baths | Filtros combinados de habitaciones y baños mínimos. | 222.1 → 1.8 | 232.0 → 2.0 | 240.0 (evict) → 3.4 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_updated_at_id_idx, property_listings_property_id_idx, listings_pkey) |
| geo-1km | Filtro geográfico estrecho (1 km) sobre el centro de Madrid. | 79.2 → 104.3 | 84.7 → 110.7 | 116.5 (evict) → 200.1 (evict) | cumple | Limit → Result → Sort → Bitmap Heap Scan → Bitmap Index Scan → Aggregate → Nested Loop → Index Scan (índices: properties_location_geography_idx, property_listings_property_id_idx, listings_pkey) |
| geo-25km-price | Filtro geográfico amplio (25 km) con orden por precio ascendente. | 387.0 → 27.1 | 422.8 → 29.0 | 489.6 (evict) → 33.9 (evict) | cumple | Limit → Result → Incremental Sort → Gather Merge → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_min_price_cents_idx, property_listings_property_id_idx, listings_pkey) |
| all-filters | Todos los filtros combinados a la vez, incluido un radio geográfico de 5 km. | 177.9 → 171.3 | 206.5 → 199.2 | 179.6 (evict) → 197.8 (evict) | cumple | Limit → Gather Merge → Sort → Bitmap Heap Scan → BitmapAnd → Bitmap Index Scan → Aggregate → Nested Loop → Index Scan (índices: properties_location_geography_idx, properties_operation_property_type_idx, properties_surface_m2_id_idx, properties_min_price_cents_idx, property_listings_property_id_idx, listings_pkey) |
| deep-default | Orden por defecto con paginación profunda (página 100). | 386.4 → 24.9 | 395.7 → 27.9 | 432.6 (evict) → 68.8 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_updated_at_id_idx, property_listings_property_id_idx, listings_pkey) |
| deep-filtered | Filtros de operación/tipo con orden por precio y paginación profunda (página 100). | 492.4 → 25.0 | 510.1 → 27.7 | 515.1 (evict) → 66.4 (evict) | cumple | Limit → Index Scan → Aggregate → Sort → Nested Loop (índices: properties_operation_property_type_min_price_cents_idx, property_listings_property_id_idx, listings_pkey) |

Leyenda de métodos de corrida en frío (diseño decisión 8):
- `evict`: búferes compartidos vaciados antes de cada corrida en frío (la caché de páginas de WSL2 puede seguir caliente).
- `restart`: PostgreSQL reiniciado antes de cada corrida en frío (la caché de páginas del sistema operativo puede seguir caliente).

## Nota tras el paso 2.5: filtro de visibilidad

Desde el paso 2.5 (decisión 109) la búsqueda añade `active_listing_count > 0`. Ningún índice de la
0012 lo cubre: es un **filtro de montón** aplicado sobre los recorridos de índice ordenados. Mientras
casi todas las viviendas sigan visibles, el recorrido encuentra sus 25 filas casi sin descartar y los
planes de esta página se mantienen (los tests de plan pasan sin cambios sobre una base con 0014-0016).

Si crece la proporción de viviendas ocultas (purgas de zona, retiradas por verificación), el recorrido
tendrá que descartar más filas por cada una devuelta, y las combinaciones con orden por precio o por
superficie son las primeras en notarlo. En ese caso hay que **volver a medir** con `bench-search` y
valorar un índice parcial `WHERE active_listing_count > 0`.

### Medición repetida con 0014-0016 (2026-09-30)

La base de banco se migró a la 0016. El corpus se había perdido: la base tenía 0 filas y 13
migraciones. Se regeneró idéntico, con la misma semilla y el mismo ancla: 1.000.000 de viviendas y
1.350.358 anuncios, todas visibles. La matriz se repitió con el mismo método: 20 corridas y
`cold-mode evict`, con `ALTER DATABASE buscahogar_bench SET jit = off` durante la medición para
reproducir el ajuste de `web_readonly`, restaurado después.

| id | p95 2.4 (ms) | p95 2.5 (ms) | objetivo 500 ms |
|---|---|---|---|
| default | 3,4 | 3,1 | cumple |
| op-type | 2,3 | 2,3 | cumple |
| price-range-rent | 2,3 | 2,2 | cumple |
| price-desc | 2,5 | 1,9 | cumple |
| surface-selective | 2,4 | 2,3 | cumple |
| surface-sort | 2,8 | 2,1 | cumple |
| rooms-baths | 2,0 | 2,4 | cumple |
| geo-1km | 110,7 | 88,4 | cumple |
| geo-25km-price | 29,0 | 30,0 | cumple |
| all-filters | 199,2 | 205,0 | cumple |
| deep-default | 27,9 | 30,0 | cumple |
| deep-filtered | 27,7 | 28,0 | cumple |

Los planes son los mismos y las diferencias quedan dentro del ruido. El filtro no tiene un coste
medible mientras todas las viviendas sean visibles. Resultados en
`apps/ingestion/.bench/run-2026-09-30T10-27-31-959Z.json`.

**Aviso de método.** Una primera repetición sin `jit = off` dio 555 ms de p95 en `geo-25km-price`,
con el mismo plan y 719 ms de compilación JIT. No fue una regresión del filtro: el banco conecta como
propietario y no hereda el ajuste de `web_readonly`. Cualquier medición futura debe aplicar el mismo
`ALTER DATABASE … SET jit = off`.

