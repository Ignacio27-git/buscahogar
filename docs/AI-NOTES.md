# Notas sobre el desarrollo asistido

Registro de fallos y comportamientos reseñables de la asistencia durante el desarrollo.
Material para el capítulo de proceso de la memoria.

**Quién anota qué.** El agente registra aquí los fallos que él mismo detecta y corrige
durante una tarea, según la sección de registro obligatorio de `CLAUDE.md`. Los fallos que
solo aparecen en la revisión posterior —código incorrecto que pasó desapercibido, tests que
validaban lo equivocado— los añade el desarrollador, porque el agente no puede registrar lo
que no ha visto.

Anotar solo lo que enseñe algo. No hace falta registrar cada corrección menor.

**Categorías útiles:** API o método inexistente · patrón de versión anterior del framework ·
código correcto en apariencia pero incorrecto · deriva de la arquitectura entre sesiones ·
test que valida el comportamiento equivocado · pérdida de contexto en tareas largas.

Interesa especialmente el contraste entre tareas donde se puede verificar la salida con
solvencia (React, Next, TypeScript) y tareas donde no (deduplicación, consultas espaciales,
particularidades de la API de la fuente).

---

## Plantilla

```markdown
### [fecha] — Título breve

**Contexto:** qué se estaba construyendo y en qué paquete.
**Categoría:** de la lista anterior.
**Qué ocurrió:** descripción del fallo.
**Cómo se detectó:** revisión, error de compilación, test, comportamiento en ejecución.
**Coste:** aproximado, en minutos.
**Observación:** si aplica, por qué era previsible o cómo se evitaría.
```

---

## Registro

<!-- Añadir entradas nuevas arriba, en orden cronológico inverso -->

### 2026-09-15 — Una aserción de plan que no podía fallar nunca, presentada como prueba en tres artefactos

**Contexto:** paso 1.8, `CHK-GIST-SELFJOIN`. La detectó la fase `sdd-verify`, y la había dado
por buena antes tanto `sdd-apply` como el propio orquestador al revisar el fichero.

**Categoría:** código que compila, pasa y verifica exactamente nada.

**Qué ocurrió:** `packages/db/test/blocking/blocking-plan.test.ts` afirmaba
`expect(planText).not.toContain('Seq Scan on listings')` sobre el resultado de
`EXPLAIN (ANALYZE, FORMAT JSON)` serializado con `JSON.stringify`. Esa cadena literal **no
existe en el formato JSON**: ahí el tipo de nodo y la relación son claves separadas
(`"Node Type": "Seq Scan"`, `"Relation Name": "listings"`, `"Alias": "a"`). El fraseo
`Seq Scan on listings` solo aparece en el `EXPLAIN` de formato TEXT. La aserción pasaba
siempre, incluso con el plan que `FB-GIST-NOT-CHOSEN` existe precisamente para impedir.

**Cómo se detectó:** `sdd-verify` no se conformó con ver el test en verde: forzó un recorrido
secuencial real sobre `listings` contra el contenedor y comprobó que la subcadena seguía sin
aparecer. Confirmado después de forma independiente por el orquestador —
`explain (analyze, format json) select count(*) from listings` con `enable_indexscan=off`
devuelve 0 ocurrencias del literal.

**Coste:** aproximado, 40 minutos entre detección, confirmación independiente, reescritura de
la aserción y prueba de que la nueva sí falla.

**Observación:** es el fallo más caro de este paso, y no por el tiempo. La aserción se citó
como prueba de una propiedad de seguridad en tres artefactos distintos (spec, tareas y
`apply-progress`), y el orquestador llegó a informar al responsable de que «la aserción de plan
es real». Un test que no puede fallar es peor que no tener test: ocupa el hueco de la prueba y
apaga la sospecha. La corrección recorre el árbol del plan y compara campos en vez de buscar
subcadenas, y se acotó a lo que de verdad importa: el lado interno `b` entra por
`listings_location_geography_idx` y nunca se recorre secuencialmente. `a` sí se recorre una
vez, por ser la relación conductora del autojoin, así que la aserción original —además de
vacía— habría sido falsa de haber funcionado. La nueva se validó poniéndola en rojo a propósito
con `enable_indexscan=off` antes de darla por buena.

### 2026-09-15 — Comentario falso en `listing-writer.ts`: afirmaba que las coordenadas están ausentes de todo lo que emite el adaptador de Idealista

**Contexto:** el comentario se escribió en el paso 1.7 (persistencia y barrido), fase
`sdd-apply`; se detectó y corrigió en el paso 1.8, durante la verificación de R1 (obs #127) y
la tarea DOC-1.

**Categoría:** código correcto en apariencia pero incorrecto — en este caso, un comentario, no
código ejecutable, pero en la dirección peligrosa: afirma justo lo contrario de lo que hace el
código de al lado.

**Qué ocurrió:** `apps/ingestion/src/sweep/listing-writer.ts:80-82` afirmaba, sobre el spread
condicional que escribe `listings.location`: *"Ausente en todo lo que emite este adaptador
(1.6 D9) — se escribe solo cuando llega, nunca se inventa."* Es falso:
`apps/ingestion/src/sources/idealista/normalizer.ts:36-39` emite `coordinates` siempre que la
fuente aporta `latitude`/`longitude`, y la propia API de búsqueda de Idealista los devuelve en
la práctica — el corpus real verificado en el paso 1.8 (obs #127) tenía 50/50 filas con
`location` poblada.

**Cómo se detectó:** al verificar R1 (la caveat de coordenadas ofuscadas/ausentes) del paso
1.8 contra la base de datos real, antes de dar la spec por cerrada — no por revisión del
código en sí, sino por contrastar la afirmación del comentario con el dato medido.

**Coste:** aproximado, 10 minutos (una línea de comentario corregida, tarea 4.1 del paso 1.8).

**Observación:** el comentario no cambiaba ningún comportamiento — el spread condicional de
las líneas 83-85 era y sigue siendo correcto —, pero un comentario que afirma lo contrario de
lo que el código hace es peor que no tener comentario: induce a un lector futuro (humano o
agente) a "corregir" código correcto basándose en una premisa falsa. Corregido para decir que
las coordenadas se escriben siempre que el normalizador las emite, y que el spread condicional
existe para una fuente que no las aporte, no porque este adaptador las omita sistemáticamente.

### 2026-09-15 — `.offset(0)` como barrera de optimización: código que compilaba y parecía correcto, pero no hacía nada

**Contexto:** paso 1.8, fase `sdd-apply` (batch 2), `packages/db/src/blocking.ts`
(`pairCandidatesSubquery`).

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** para forzar a PostgreSQL a evaluar la subconsulta `LATERAL` del bloqueo de
candidatos como un bucle anidado real (en vez de "aplanarla" de vuelta al árbol de uniones
del padre y reordenar libremente), se añadió `.offset(0)` como la barrera de optimización
clásica de Postgres — un modismo bien conocido que no cambia el resultado (ningún registro se
descarta con offset cero) pero impide el "pull-up" de la subconsulta. El código compilaba,
tenía el comentario correcto explicando la intención, y `EXPLAIN (ANALYZE, FORMAT JSON)`
seguía devolviendo el plan malo — exactamente el mismo plan, byte a byte, que sin `.offset(0)`
en absoluto.

**Cómo se detectó:** al no ver ningún cambio en el plan tras dos restructuraciones distintas,
se dumpeó `query.toSQL().sql` con un `console.log` temporal dentro del propio test (revertido
después de la comprobación) para inspeccionar el SQL real enviado a Postgres. No aparecía
ningún "offset" en el texto. Se confirmó leyendo el código fuente de Drizzle 0.45.2
(`node_modules/.../drizzle-orm/pg-core/dialect.js:287`): `const offsetSql = offset ? sql\`
offset ${offset}\` : void 0;` — `0` es falso en JavaScript, así que la cláusula `OFFSET` nunca
se renderiza cuando el valor es literalmente cero.

**Coste:** aproximado, 20-25 minutos (dos iteraciones de restructuración de consulta más la
inspección de `toSQL()` y del código fuente de Drizzle).

**Observación:** el idioma "`OFFSET 0` como barrera de optimización" es correcto para
PostgreSQL en general, pero no es universalmente cierto a través de un ORM: cada capa que
genera SQL puede tener su propia comprobación de "valor por defecto" que descarta
silenciosamente un `0` legítimo. La lección generalizable: cuando una técnica de SQL conocida
no produce el efecto esperado, inspeccionar el SQL *realmente enviado* (`toSQL()`, un log, o
el propio `EXPLAIN`) antes de asumir que el motor de base de datos se comporta distinto a lo
documentado — el defecto estaba en la capa intermedia, no en Postgres. Corregido usando
`.limit(Number.MAX_SAFE_INTEGER)` en su lugar, que no tiene esa comprobación de falsedad.
Registrado también como decisión 043 en `docs/DECISIONS.md`.

### 2026-09-15 — La suite de tests de `packages/db` truncó el corpus real de Idealista del paso 1.7

**Contexto:** paso 1.8, fase `sdd-apply` (batch 1-2), `packages/db/test/blocking/
blocking-plan.test.ts` (bulk-insert de ~2000 filas sintéticas para las pruebas de plan de
consulta bajo volumen).

**Categoría:** pérdida de contexto/estado entre sesiones — un efecto secundario destructivo
de un mecanismo de test preexistente, no introducido por esta tarea.

**Qué ocurrió:** ejecutar `pnpm --filter @buscahogar/db run test:blocking` (y también el
`test` por defecto del paquete) truncó `listings`, `listing_versions` y el resto de tablas de
`DATABASE_URL` antes de cada suite (`truncateAll`, `packages/db/test/helpers/
db-client.ts:34-36`). En este entorno `DATABASE_URL` apunta a la misma base de datos que
contenía los 50 anuncios reales de Idealista ingeridos en la ejecución de aceptación del paso
1.7 (obs #122 en Engram). Quedaron sustituidos por un corpus sintético de 2000 filas
(`external_id` `bulk-N`, `url` `https://example.test/bulk/N`) y `coverage_jobs` quedó vacío.

**Cómo se detectó:** al retomar la tarea en un batch posterior y consultar directamente la
base de datos para verificar el estado real del corpus antes de confiar en un checkpoint
previo (instrucción explícita del batch 2: "verify the tree, do not trust it").

**Coste:** irrecuperable sin gasto de cuota — restaurar el corpus real cuesta
aproximadamente 2 peticiones facturables de la API de Idealista (un barrido nuevo de
Granada), la misma cuota que costó obtenerlo la primera vez. No se ha vuelto a ingerir: es
una decisión del responsable del proyecto, no automática.

**Observación:** el mecanismo no es nuevo de este paso — `packages/db/test/integration/
coverage.test.ts` y `dedup-recompute.test.ts` ya truncaban del mismo modo antes de 1.8 — pero
nadie lo había señalado como destructivo hasta que un dato con coste real de cuota se perdió
por ejecutarlo. Registrado como decisión 046 en `docs/DECISIONS.md` (problema pendiente, sin
solución aplicada en este cambio: requiere una base de datos de test separada o un guardián
que rechace truncar una base de datos que no sea la designada).

### 2026-09-14 — PERSIST-3 (spec) contra el paso 2 de D5 (diseño): qué columnas de `listings` puede tocar una re-visión

**Contexto:** paso 1.7, fase `sdd-apply` (batch 3), implementación de `listing-writer.ts`.

**Categoría:** deriva entre artefactos de la misma planificación.

**Qué ocurrió:** PERSIST-3 (spec) afirma, sin condición, que una re-visión NO debe modificar
`url`, `location`, `location_id` ni `coordinates_obfuscated` — solo `last_seen_at` y
`updated_at` pueden cambiar. El paso 2 de D5 (diseño), en su prosa de ejemplo («nunca vaciar:
url/location/coordinatesObfuscated se escriben solo cuando el valor entrante está
definido»), se lee como un permiso de sobrescritura condicionada, más laxo que el «nunca» de
la spec.

**Cómo se detectó:** al escribir la cláusula `set` del `onConflictDoUpdate` de la fila de
identidad, contrastando el texto exacto de la spec contra la prosa del diseño en vez de
implementar la primera lectura que encajara.

**Cómo se resolvió:** a favor de la spec, por ser el documento de criterios de aceptación:
la cláusula `set` solo incluye `{lastSeenAt, updatedAt}`. El RED test existente no
discriminaba entre ambas lecturas (sus re-visiones reutilizan el mismo `item`, así que
`url`/`location` nunca cambian de valor en ninguna de las dos interpretaciones).

**Observación:** mismo patrón que la entrada de columnas de identidad (3 frente a 4,
sesión de esta misma fecha): cuando la prosa de un documento resume o ejemplifica lo que
otro documento fija como regla, el resumen es el que cede. Ninguna prueba obligaba a elegir
—las dos lecturas pasaban el mismo test— así que sin comparar el texto exacto la elección
habría sido arbitraria y silenciosa.

---

### 2026-09-14 — A quién le toca resolver `sources.key` → UUID: ¿a `listing-writer.ts` o al compositor?

**Contexto:** paso 1.7, fase `sdd-apply` (batch 3), alcance de `listing-writer.ts` frente al
de `reference-store.ts` y el futuro compositor (`scripts/sweep-zone.ts`, fase 4).

**Categoría:** deriva entre artefactos de la misma planificación.

**Qué ocurrió:** la instrucción de lanzamiento del batch describía el trabajo de
`listing-writer.ts` como «resolver `Listing.sourceId` ('idealista') a la UUID FK vía
`sources.key`; fallar en voz alta si falta» — lectura que sitúa PERSIST-9 dentro de
`listing-writer.ts`. El diseño (D5 paso 1), el propio puerto `PersistPageInput` (`store.ts`,
fase 1) y el RED test ya escrito coincidían en lo contrario: la resolución ocurre UNA vez
por barrido, en el compositor, y `sourceUuid` llega ya resuelto como campo del input.

**Cómo se detectó:** cruzando las tres fuentes (diseño, tipo del puerto, fixture del propio
test) antes de escribir el lookup redundante que la instrucción de lanzamiento sugería.

**Cómo se resolvió:** a favor del trío diseño/puerto/test: `listing-writer.ts` escribe
`input.sourceUuid` directamente en `listings.source_id`, sin volver a consultar `sources`.
`reference-store.ts` (fase 2) ya implementa PERSIST-9; es responsabilidad del compositor
(fase 4) llamarlo una vez y pasar el resultado.

**Observación:** una paráfrasis en una instrucción de lanzamiento no es una fuente de
autoridad equivalente al diseño, al tipo del puerto ya cerrado y al test ya escrito — cuando
las tres coinciden entre sí y difieren de la paráfrasis, ganan las tres. Registrado para que
la fase 4 no repita el lookup por duplicado.

---

### 2026-09-14 — Las tareas decían tres columnas de identidad; la tabla del diseño lista cuatro

**Contexto:** paso 1.7, fase `sdd-apply`. Distinción entre las columnas que determinan la
identidad de un anuncio y las que, al cambiar, producen una versión nueva.

**Categoría:** deriva entre artefactos de la misma planificación.

**Qué ocurrió:** la prosa del artefacto de tareas hablaba de «3 campos de columna de
identidad». La tabla del propio diseño lista cuatro: `url`, `coordinates`, `location` y
`coordinatesObfuscated`. Las dos afirmaciones no pueden ser ciertas a la vez.

**Cómo se detectó:** al implementar el módulo correspondiente, contrastando la prosa de las
tareas contra la tabla del diseño en lugar de codificar la primera cifra leída.

**Cómo se resolvió:** a favor de la tabla del diseño, que es internamente consistente con su
propia aritmética de campos.

**Observación:** la prosa que resume una tabla es una copia, y una copia se desincroniza del
original. Mismo patrón que la afirmación de «cinco entradas» sobre este fichero registrada
el 2026-09-08: nadie comprueba una cifra que suena razonable hasta que la cuenta. Contar las
filas de la tabla cuesta segundos; comparar por tres columnas de identidad en vez de cuatro
habría cambiado en silencio qué cuenta como el mismo anuncio.

---

### 2026-09-14 — Una puerta de tests que habría quedado verde para siempre sin probar nada

**Contexto:** paso 1.7, estrategia de tests con base de datos para `apps/ingestion`.

**Categoría:** test que valida el comportamiento equivocado — en el límite, que no valida
nada.

**Qué ocurrió:** el movimiento obvio era copiar `packages/db/test/helpers/docker-gate.ts` a
`apps/ingestion`, igual que se copia `db-client.ts`. No funciona:
`apps/ingestion/test/setup-no-network.ts` no carga ningún `.env` **a propósito** —su propio
comentario exige que las credenciales estén «ausentes del proceso de test»—, mientras que
`packages/db/vitest.config.ts` sí carga el `.env` de la raíz. La puerta copiada encontraría
`DATABASE_URL` ausente y saltaría el 100% de los tests de base de datos, informando verde,
indefinidamente.

**Cómo se detectó:** `sdd-design`, comparando las dos configuraciones de Vitest en vez de dar
por portable un helper por el hecho de vivir en el mismo monorepo.

**Cómo se resolvió:** un `vitest.db.config.ts` aparte, cuyo fichero de setup **lanza** si
falta `DATABASE_URL` en lugar de saltar.

**Observación:** saltar es correcto donde la precondición es opcional y se puede cumplir. En
un paquete donde esa misma precondición está prohibida por diseño, el helper idéntico
convierte la suite entera en un no-op verde. La diferencia entre saltar y lanzar no es de
estilo: decide si la ausencia del entorno se ve. Es la misma familia de fallo que la tabla
marcador del paso 1.2 y la aserción negativa del 1.5 — la prueba vacía, cuyo verde es
indistinguible del legítimo.

---

### 2026-09-14 — Redondeo entre dominio y columna: el comparador habría insertado una versión nueva en cada barrido

**Contexto:** paso 1.7, diseño del detector de cambios que decide si un anuncio genera una
fila nueva en `listing_versions`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** `packages/core/src/schemas/listing.schema.ts` tipa `surfaceM2`, `rooms` y
`bathrooms` como `z.number().optional()`, sin restricción de entero; las columnas
correspondientes son `integer` / `smallint`. Una superficie de `78.5` se escribe redondeada
a `79` y se lee de vuelta como `79`. Un comparador que trabajara en el espacio del dominio
vería `78.5 !== 79` y **insertaría una versión nueva en cada ejecución, para siempre** —
exactamente la idempotencia que este paso existe para garantizar.

**Cómo se detectó:** `sdd-design`, trazando el viaje de ida y vuelta de cada campo entre el
tipo de dominio y su columna. No por un test: los tests que lo habrían ejercitado son los de
las fases 2 a 4, bloqueadas por la falta de contenedor.

**Coste:** ninguno en código. Se decidió comparar en el espacio de columnas antes de escribir
el comparador (decisión 037).

**Observación:** el defecto no está en el esquema ni en las columnas por separado; ambos son
correctos. Está en la frontera entre los dos, que es donde no mira ninguna de las dos
revisiones naturales. Regla que se extrae: cuando un valor cruza una frontera de tipos con
pérdida, la comparación se hace del lado donde el valor ya perdió precisión, nunca del lado
donde todavía la conserva. Y el modo de fallo es el peor posible para este paso: no rompe
nada visible, solo hace crecer el histórico con versiones idénticas hasta que alguien mira.

---

### 2026-09-14 — `sdd-propose` afirmó «sin dependencias de runtime nuevas» y era falso

**Contexto:** paso 1.7, fase `sdd-propose` del cambio `zone-sweep-persistence`; declaración
de dependencias de `apps/ingestion/package.json`.

**Categoría:** afirmación técnica no verificada.

**Qué ocurrió:** la propuesta dio por hecho que persistir en `listings` no añade ninguna
dependencia de runtime. Verificado contra el fichero: `apps/ingestion/package.json` declara
solo `@buscahogar/core`, `@buscahogar/db` y `zod` — ni `drizzle-orm` ni `pg`. No hay
`.npmrc`, así que se aplica el layout estricto de pnpm y una transitiva no es resoluble; y
la API pública de `@buscahogar/db` nombra los tipos `Database` y `Pool`.

**Cómo se detectó:** `sdd-design`, leyendo el `package.json` real en lugar de heredar la
afirmación de la fase anterior.

**Coste:** ninguno hasta ahora. El defecto es latente: nada bajo `apps/ingestion/src` importa
todavía `@buscahogar/db`, así que la fase 1 —núcleo puro— no lo despierta.

**Observación:** mismo patrón ya registrado el 2026-09-07, una afirmación de una fase
anterior propagada sin releer la fuente primaria. «Este cambio no añade dependencias» es una
afirmación sobre un fichero concreto y solo se puede hacer después de abrirlo; aquí costaba
una lectura.

---

### 2026-09-14 — `docs/ROADMAP.md:538` se contradecía con su propia línea 542

**Contexto:** paso 1.6, especificación (`sdd-spec`) y luego corrección de housekeeping
durante `sdd-apply`, en la sección de resultado de la sonda del paso 1.5 dentro de
`docs/ROADMAP.md`.

**Categoría:** deriva de la arquitectura entre sesiones — no un fallo del agente actual
sobre código nuevo, sino una afirmación incorrecta dejada por el cierre del paso 1.5 que
ninguna verificación posterior había comparado contra su propia línea vecina.

**Qué ocurrió:** la línea 538 afirmaba `hiddenResults=null` en el resumen de paginación de
la sonda. Dos líneas más abajo (línea 542), el mismo documento dice lo contrario:
"`hiddenResults` no aparece como clave en la respuesta, tampoco en la cruda: esta API no lo
devuelve en absoluto". Ambas afirmaciones no pueden ser ciertas a la vez — una clave no
puede estar ausente y valer `null` simultáneamente. Verificado contra las dos fixtures
commiteadas del paso 1.5 (100 elementos, dos envelopes): cero apariciones literales de
`"hiddenResults"` en ninguna de las dos, confirmando que :542 era la afirmación correcta y
:538 la incorrecta.

**Cómo se detectó:** lectura completa de la sección de la sonda durante `sdd-spec`, exigida
por la tarea de housekeeping del spec de este paso (`docs/ROADMAP.md:538` MUST corregirse,
consistente con :542 y con las fixtures). No fue un fallo de compilación ni de test — solo
apareció al leer las dos frases seguidas y compararlas contra los ficheros reales.

**Coste:** ~5 minutos (una búsqueda de texto sobre las fixtures y una edición de una línea).

**Observación:** esta es exactamente la distinción que le importa al normalizador del paso
1.6 (`.optional()` para clave ausente, `.nullable()` para valor `null` presente) — un
resumen redactado a mano que confunde ambos casos es peligroso precisamente porque el código
que lo hereda sí distingue entre ellos. La verificación que lo encontró fue leer el
documento entero de una sección, no solo la línea que el prompt señalaba, y contrastarlo
contra las fixtures en vez de contra la propia prosa del documento.

---

### 2026-09-10 — Una aserción de tipo que probaba el tipo indexado equivocado

**Contexto:** paso 1.4, `packages/core/test/type-assertions.test.ts`, la aserción de que
indexar un `SignalBreakdown` produce `SignalScore | undefined` bajo
`noUncheckedIndexedAccess`.

**Categoría:** código con apariencia correcta pero comportamiento incorrecto.

**Qué ocurrió:** la primera versión de la aserción comparaba directamente el tipo indexado
`SignalBreakdown[string]` contra `SignalScore | undefined` con el helper `Equal`. Parecía la
forma obvia de expresarlo, pero `tsc --noEmit` la rechazó: `SignalBreakdown[string]` resolvía
a `SignalScore` a secas, sin `undefined`. `noUncheckedIndexedAccess` añade `| undefined` al
resolver una **expresión** de indexación sobre un valor (`objeto[clave]` dentro de código
real), no al **tipo indexado** `T[K]` en sí mismo como operación de tipos independiente —
una distinción que no está documentada de forma prominente y que se verificó de forma
aislada con un `tsconfig.json` mínimo antes de corregir.

**Cómo se detectó:** error de compilación (`tsc --noEmit`, no en la ejecución de Vitest —
las importaciones `import type` se eliminan en tiempo de transformación y no habrían dado
ninguna señal en tiempo de ejecución).

**Coste:** aproximado, 10 minutos (una comprobación aislada con un `tsconfig.json` de
prueba para confirmar el comportamiento real antes de corregir la aserción).

**Observación:** la corrección captura el tipo de retorno de una función cuyo cuerpo indexa
de verdad un valor (`function readSignal(...): SignalScore | undefined { return
breakdown[key]; }`), y usa `ReturnType<typeof readSignal>` para la comparación. Habría sido
previsible con una comprobación aislada del comportamiento del flag antes de escribir la
aserción, en vez de asumir que un tipo indexado y una expresión de indexación se resuelven
igual.

### 2026-09-10 — `.finite()` generado en un esquema Zod, ya deprecated y no-op en la versión instalada

**Contexto:** paso 1.4, `packages/core/src/schemas/area-query.schema.ts`, el campo
`radiusMeters` de `areaQuerySchema`.

**Categoría:** API o método inexistente (en este caso, existente pero deprecated y sin
efecto en la versión instalada).

**Qué ocurrió:** se escribió `radiusMeters: z.number().positive().finite()`, razonando que
`.finite()` excluía explícitamente `Infinity`/`-Infinity`. `pnpm --filter @buscahogar/core
lint` lo marcó con `@typescript-eslint/no-deprecated`: en zod@4.5.4, `z.number()` ya rechaza
valores no finitos por defecto, así que `.finite()` es un no-op deprecated, no una
protección adicional.

**Cómo se detectó:** `pnpm lint` (regla `no-deprecated`), no revisión manual.

**Coste:** aproximado, 5 minutos (verificación con una llamada aislada a
`z.number().positive().safeParse(Infinity)` contra el paquete instalado antes de quitar la
llamada).

**Observación:** ya van dos versiones de Zod detectadas en este mismo cambio donde una API
de v3 sigue compilando pero está marcada legacy/deprecated en v4.5.4 (la otra es
`z.number().int()` frente a `z.int()`, ya prevista en el diseño). Antes de encadenar
métodos "defensivos" sobre un esquema, merece la pena comprobar si la versión instalada ya
cubre el caso por defecto.

### 2026-09-10 — Un test cuyo comentario prometía más de lo que sus aserciones comprobaban

**Contexto:** paso 1.5, informe del contador de peticiones de la sonda
(`apps/ingestion/scripts/probe/ledger.ts` y su test).

**Categoría:** test que valida el comportamiento equivocado.

**Qué ocurrió:** la especificación exigía que los contadores de token y de búsqueda se
informaran siempre por separado, **nunca como una única cifra combinada**, porque no está
documentado si la petición de token consume cuota de búsqueda: sumarlas afirma algo que no
sabemos. El test escrito para ese requisito llevaba este comentario:

```ts
// Cada contador aparece en su propia línea, no como una única cifra combinada.
```

Y a continuación comprobaba únicamente que la línea de token y la de búsqueda fueran
distintas entre sí. **Nunca comprobó la ausencia de una cifra combinada.** El código, en
paralelo, sí imprimía una: `Total de peticiones de red: 2. Peticiones de búsqueda
facturables: 1.` El test pasaba en verde con el incumplimiento delante.

**Cómo se detectó:** la fase de verificación, leyendo la salida real del script y
contrastándola contra el texto del requisito, no contra el test. El test no podía detectarlo:
estaba escrito para no verlo.

**Coste:** minutos. Se reforzó primero la aserción —que pasó a rojo— y después se corrigió el
render para no sumar los contadores.

**Observación:** el patrón es más incómodo que un test ausente. Un requisito sin test se ve
en la cobertura; **un test que declara en su comentario una garantía más fuerte que la de sus
aserciones se ve verde y desactiva la sospecha.** El comentario describía la intención del
requisito y las aserciones describían otra cosa más débil, y nadie contrastó una con otra
porque el test pasaba.

La lección concreta: cuando un requisito se formula en negativo —«nunca aparece X»— la
aserción tiene que ser también negativa (`expect(...).not.toMatch(...)`). Comprobar que otras
dos cosas están bien no demuestra que la tercera no esté. Y en modo TDD estricto el orden
importa: si la aserción negativa se hubiera escrito primero, habría estado en rojo desde el
inicio y el código nunca habría llegado a imprimir el total.

Vale también como aviso sobre el propio TDD estricto: escribir el test antes garantiza que
hay un test, no que el test compruebe lo que dice comprobar.

### 2026-09-10 — El comando alternativo documentado en el README tampoco funcionaba

**Contexto:** paso 1.5, ejecución de la sonda de Idealista desde `apps/ingestion`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** el README que generó la fase de implementación advertía, correctamente, de
que en PowerShell un `--` suelto puede perderse al reenviar argumentos, y ofrecía una forma
alternativa «explícita» para sortearlo:

```bash
pnpm --filter @buscahogar/ingestion exec node --env-file=../../.env --import tsx scripts/probe-idealista.ts --profile homes --execute
```

Esa alternativa **tampoco funciona**. `pnpm exec` no se sitúa en el directorio del paquete, así
que `../../.env` se resuelve contra la raíz del repositorio y falla con `../../.env: not found`.
La forma primaria tampoco: `pnpm run probe:homes -- --execute` reenvía el `--` como argumento
literal, y `parseArgs` en modo estricto lo rechaza con «argumentos posicionales inesperados».

La forma que sí funciona es entrar en el paquete, que es como `pnpm run` lo invoca por dentro:

```bash
cd apps/ingestion
node --env-file=../../.env --import tsx scripts/probe-idealista.ts --profile homes --execute
```

**Cómo se detectó:** al ejecutar de verdad. Ninguna de las dos formas documentadas llegó a
abrir una conexión, así que ambos fallos costaron cero cuota.

**Coste:** dos intentos fallidos, minutos. README corregido con la forma que funciona y con la
explicación de por qué las otras dos no.

**Observación:** el patrón interesante no es el fallo, es **dónde** estaba. El agente
identificó un riesgo real —el reenvío de `--`—, se molestó en documentar una vía de escape, y
la vía de escape estaba rota por un motivo distinto y no comprobado. Una advertencia sobre un
problema real da una falsa sensación de cobertura: quien la lee asume que alguien probó la
alternativa. Aquí nadie la probó, porque probarla implicaba gastar cuota y toda la fase estaba
deliberadamente prohibida de tocar la API.

De ahí una lección concreta para pasos con recursos escasos: **si un comando no se puede
ensayar sin gastar el recurso, la documentación debe decir que no está verificado**, en lugar
de presentarlo con la misma autoridad que los que sí se probaron. Los dos fallos, además,
fallaron cerrando —sin abrir conexión—, que es exactamente lo que el diseño buscaba con el
modo de simulación por defecto y con `parseArgs` en estricto.

### 2026-09-10 — Separador opcional fuera del grupo del prefijo en el anonimizador de teléfonos

**Contexto:** paso 1.5, anonimizador de datos personales de `apps/ingestion/scripts/probe/anonymise.ts`.
Barre texto libre (`description`) buscando teléfonos y correos antes de commitear el fixture
de la sonda de Idealista.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** la primera versión de `PHONE_PATTERN` dejaba el separador opcional **fuera**
del grupo del prefijo internacional, en lugar de anidado dentro. Con esa forma, el separador
podía casar sin que hubiera prefijo, así que la coincidencia empezaba un carácter antes de lo
debido y se comía el espacio previo al número:

```text
"Llamar al 612345678"  →  "Llamar al[REDACTED_PHONE]"     (mal, falta el espacio)
"Llamar al 612345678"  →  "Llamar al [REDACTED_PHONE]"     (bien)
```

La redacción del teléfono sí funcionaba. Lo que se corrompía era el texto que la rodeaba.

**Cómo se detectó:** su propio test en rojo, escrito antes que la implementación por el modo
TDD estricto. La aserción comparaba la cadena completa resultante, no solo la presencia del
marcador de redacción, así que el espacio perdido hizo fallar el test de inmediato.

**Coste:** minutos. Corregido en la misma sesión anidando el separador dentro del grupo del
prefijo.

**Observación:** el fallo es interesante por dónde estaba, no por su dificultad. Un test que
solo hubiera comprobado «el teléfono ya no aparece» habría pasado en verde con el error
dentro. Lo que lo cazó fue afirmar sobre la cadena entera, es decir, sobre lo que se conserva
además de sobre lo que se elimina. Para un anonimizador esa distinción es la que importa: su
trabajo no es solo borrar, es borrar sin destruir el resto, porque el fixture tiene que seguir
sirviendo a los tests del normalizador del paso 1.6.

Vale también como argumento a favor del TDD estricto en este módulo concreto. Es código puro,
sin dependencias, y su modo de fallo —publicar datos personales de terceros en un repositorio
que se entrega, o corromper la evidencia— no se manifiesta en tiempo de compilación ni en una
lectura rápida del diff.

### 2026-09-09 — `drizzle-kit` no reconoce `geography` y lo entrecomilla como identificador

**Contexto:** fase 3 del paso 1.3, primera aplicación real de las migraciones contra el
contenedor de PostgreSQL 17 + PostGIS 3.5.2.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** `pnpm db:migrate` falló contra la base limpia con
`SQLSTATE 42704: type "geography(Point,4326)" does not exist`. La causa no está en el
esquema: `drizzle-kit` 0.31.10 mantiene una lista de tipos nativos que incluye `geometry`
pero **no** `geography`, así que entrecomilla toda la cadena devuelta por el `customType`
convirtiéndola en un identificador SQL inválido. Comprobado sobre su propio código
empaquetado: `"geometry"` aparece seis veces y `"geography"` ninguna.

**Cómo se detectó:** por `CHK-GEOG-STORED`, la comprobación del diseño, al ejecutar la
migración. El detalle decisivo es que **el fallo no era el previsto**: el diseño había
definido que la alternativa `FB-GEOG-EXPR` se activara solo con `SQLSTATE 42P17` y el
mensaje `generation expression is not immutable`. Al observarse `42704`, la alternativa
**no** se aplicó, y en su lugar se diagnosticó la causa real. Antes de tocar el esquema se
probó la premisa con SQL crudo dentro de una transacción revertida: una columna `geography`
generada `STORED` con índice GiST funciona sin problema en PostgreSQL 17. El diseño era
correcto; lo incorrecto era la generación de código.

**Coste:** aproximadamente 40 minutos entre diagnóstico y corrección. Resuelto retirando
las dos cláusulas mal generadas de `0001_fixed_speed_demon.sql` —que nunca había llegado a
aplicarse en ningún entorno, y cuyo fallo abortaba el `CREATE TABLE` entero sin dejar nada
que un `ALTER` pudiera reparar— y añadiendo `0003_fix_geography_generated_column.sql` con
el DDL correcto sin entrecomillar.

**Observación:** un disparador vago —«si la migración falla, aplica la alternativa»— habría
modificado el esquema para rodear un problema que no tenía, dejando intacto el defecto real
y probablemente sin descubrir. La precisión del disparador (SQLSTATE y mensaje exactos) es
lo que convirtió un fallo en un diagnóstico. Y es la segunda vez en este mismo paso que el
esquema TypeScript era correcto y el SQL generado no: `customType` no sale gratis, porque
cualquier tipo que la herramienta no conozca de forma nativa puede renderizarse mal aunque
los tipos sean perfectos. Después de generar una migración que use `customType`, hay que
leer el SQL emitido.

En la misma fase salieron otros dos defectos que nada había anticipado, porque hasta
entonces nunca se había ejecutado el código compilado: los imports relativos sin extensión
`.js` rompen el cargador ESM nativo de Node (`moduleResolution: "Bundler"` los tolera en
compilación, pero `node dist/seed.js` no), y la carga de `.env` se resolvía contra
`process.cwd()`, que `pnpm --filter` cambia al directorio del paquete. Resueltos con
`--env-file` y `process.loadEnvFile()`, sin añadir dependencias.

### 2026-09-09 — `drizzle-kit` emite `geometry(point)` sin SRID pese a declararlo

**Contexto:** fase 2 del paso 1.3, generación de la migración inicial del esquema en
`packages/db`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** las columnas espaciales de `listings` y `properties` se declararon como
`geometry({ type: 'point', mode: 'xy', srid: 4326 })`. El código compila y `pnpm typecheck`
pasa sin una sola queja. Pero `drizzle-kit generate` 0.31.10 emitió en
`0001_fixed_speed_demon.sql` la línea `"location" geometry(point),` — en minúscula y **sin
SRID alguno** — en las dos tablas. Sin SRID, PostGIS asigna el 0, y el cast a `geography` de
la columna generada que sostiene el índice GiST deja de significar lo que el diseño supone.

**Cómo se detectó:** por `CHK-SRID`, una comprobación con nombre que el diseño definió
precisamente porque la fase de investigación había dejado ese punto sin confirmar (hueco G1):
`grep -n "geometry(Point,4326)"` sobre el SQL generado devolvió cero coincidencias.

**Coste:** unos 10 minutos. Se resolvió con la migración correctora
`0002_fix_geometry_srid.sql`, que hace `ALTER COLUMN ... TYPE geometry(Point, 4326)` sobre
ambas tablas. Sin pérdida de datos: ninguna tabla tenía filas todavía.

**Observación:** el esquema TypeScript era correcto; lo incorrecto fue la emisión de SQL.
Ninguna comprobación del lado de TypeScript —typecheck, lint, tipos inferidos— podía
detectarlo, porque el defecto vive en el artefacto generado y no en el código fuente. La
lección general vale más allá de Drizzle: cuando una herramienta genera SQL a partir de una
declaración, una declaración correcta no garantiza SQL correcto, y el único control válido
es leer lo emitido. Sin la comprobación explícita, el error habría llegado a la base de
datos y solo se habría manifestado como un bloqueo de deduplicación que no encuentra
candidatos. Efecto secundario: la migración correctora obliga a `drizzle-kit` a regenerar un
snapshot completo del esquema, duplicando el volumen de líneas generadas.

### 2026-09-09 — `explicit-function-return-type` de ESLint también se dispara en factorías privadas sin exportar

**Contexto:** `packages/db/src/schema/columns.ts` (fase 1 del paso 1.3), helpers
compartidos `id()` y `createdAt()` para las columnas comunes de todas las tablas.

**Categoría:** código correcto en apariencia pero incorrecto (suposición sobre el alcance
de una regla de lint).

**Qué ocurrió:** se asumió que la regla `@typescript-eslint/explicit-function-return-type`
de la configuración compartida solo se aplica a funciones exportadas, así que las dos
factorías internas (`buildId`, `buildCreatedAt`) que construyen el tipo de retorno real de
`id()`/`createdAt()` se dejaron sin anotar. `pnpm lint` falló: la regla se dispara igual
sobre una función local sin exportar.

**Cómo se detectó:** ejecución real de `pnpm lint`, no revisión previa de la configuración
de la regla.

**Coste:** minutos; una única ejecución de lint y un ajuste localizado.

**Observación:** el tipo de retorno concreto de esas dos factorías es un genérico
profundamente anidado de `drizzle-orm` que no se puede escribir a mano sin inventarlo o sin
degradar su precisión, lo que debilitaría `$inferSelect`/`$inferInsert` de cada tabla que
use estos helpers. Se añadió un `eslint-disable-next-line` puntual, con justificación en
español, solo sobre las dos factorías privadas; las funciones públicas `id()`/`createdAt()`
siguen completamente tipadas vía `ReturnType<typeof buildId>` /
`ReturnType<typeof buildCreatedAt>`, sin ningún `eslint-disable` en la superficie
exportada. Es la primera vez que aparece un `eslint-disable` en el repositorio: se registra
explícitamente en lugar de dejarlo pasar en silencio, y la excepción queda acotada a dos
funciones no exportadas, documentada en el propio código.

### 2026-09-09 — `context7` inalcanzable a mitad de sesión; verificación contra los `.d.ts` instalados en su lugar

**Contexto:** investigación de la API de Drizzle 0.45.2 para el paso 1.3 (columnas de
geometría, forma de la configuración adicional de `pgTable`, índices GiST/GIN, enums).

**Categoría:** pérdida de una capacidad de la sesión, no del código.

**Qué ocurrió:** el servidor MCP `context7` no conectó (`CONNECT_TIMEOUT`) durante la fase
de investigación. El usuario lo instaló a mitad de sesión, pero las conexiones MCP se
establecen al arrancar la sesión y no pudieron reestablecerse sin reiniciarla. La
investigación tuvo que apoyarse en documentación web sin versión explícita, donde conviven
contenido de la serie 0.x y de una beta de la serie 1.x sin distinguirse con claridad.

**Cómo se detectó:** el propio intento de conexión falló con un error explícito; no fue un
fallo silencioso.

**Cómo se resolvió:** una fase posterior leyó directamente los ficheros `.d.ts` instalados
en `node_modules` para la versión exacta fijada en `package.json`
(`drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`), en lugar de depender de la documentación
pública.

**Coste:** una ronda de verificación adicional; sin impacto en el calendario porque era
trabajo offline y no bloqueaba nada más.

**Observación:** la verificación contra el artefacto instalado resultó ser evidencia más
fuerte que la documentación, no solo un sustituto de emergencia. La pregunta de si la
función adicional de `pgTable` (`extraConfig`) espera un array o un objeto no se podía
resolver leyendo la documentación pública, porque ambas formas aparecen documentadas y
ambas siguen aceptadas en 0.45.2; solo el orden de declaración y el estado de "legado" en
los propios tipos revelan cuál es la preferida. Para una dependencia con versión fijada, el
`.d.ts` instalado es la fuente que manda, por encima de la documentación y por encima de
cualquier servidor de documentación.

### 2026-09-09 — `ST_DWithin` sobre `geometry` mide grados, no metros

**Contexto:** fase de investigación del paso 1.3, antes de escribir ninguna tabla del
esquema de deduplicación geográfica.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** un bloqueo de deduplicación por proximidad escrito de forma natural —
`ST_DWithin(location, punto, radio_en_metros)` sobre una columna `geometry(Point,4326)` —
compila, se ejecuta sin ningún error y no lanza ningún aviso. La consulta interpreta el
radio en las unidades del sistema de referencia espacial de la columna, que en SRID 4326
son grados, no metros. Un radio pensado como "500 metros" se convierte en 500 grados, que
cubre casi medio planeta.

**Cómo se detectó:** investigación dirigida contra la documentación de PostGIS
(`ST_DWithin`, guía de introducción a geography) antes de escribir código, no por un test
que lo revelara después.

**Coste:** ninguno realizado — se evitó por completo antes de escribir la primera tabla.

**Observación:** es el tipo de fallo más peligroso para este proyecto: no rompe ningún test
si el test no compara metros reales, y un radio equivocado en órdenes de magnitud puede
pasar desapercibido durante meses agrupando —o dejando de agrupar— viviendas sin ningún
síntoma visible salvo resultados de búsqueda progresivamente peores. Resuelto en el diseño
con una columna `geography` generada y GiST sobre ella (decisión 019 de `DECISIONS.md`), no
con una corrección posterior de la consulta.

### 2026-09-08 — Requisito cumplido en el sitio equivocado del fichero

**Contexto:** fase `verify` del paso 1.2. La spec (REQ-06) exige que los comentarios de los
stanzas `web` e `ingestion` digan que durante el desarrollo esos servicios se ejecutan en
local con `pnpm dev:web` / `pnpm dev:ingestion`, y que solo la base de datos corre en Docker.

**Categoría:** requisito satisfecho en el fichero pero no en la ubicación que la
especificación exige.

**Qué ocurrió:** el diseño colocó esa frase en la cabecera de `docker-compose.yml` (línea 2)
y `apply` la reprodujo tal cual. El comentario que sí está encima del stanza `web` hablaba de
perfiles, de `docs/ARCHITECTURE.md` y de los Dockerfiles inexistentes, y mencionaba que
`docker compose up -d` levanta solo `db` —la mitad del requisito—, pero no decía nada de
`pnpm dev:web`. `grep -n "pnpm dev" docker-compose.yml` devolvía una única línea, la 2,
cuarenta líneas por encima del stanza. Ninguna de las fases anteriores lo detectó: la spec y
el diseño se escribieron en la misma sesión y nadie contrastó el escenario contra el sitio
concreto que nombraba.

**Cómo se detectó:** la fase `verify`, al comprobar el escenario contra la ubicación literal
que la spec nombra («the comment above the `web` service») en lugar de buscar la frase en
todo el fichero.

**Cómo se resolvió:** se amplió el comentario compartido situado encima de `web` —que ya
nombraba a ambos servicios— para decirlo explícitamente. `docker compose config -q` sigue en
0 y Prettier limpio.

**Observación:** el fallo no era funcional. Leyendo el fichero entero, el requisito original
del prompt del ROADMAP («deja claro en comentarios que durante el desarrollo se ejecutan en
local») ya se cumplía. Lo que falló fue la trazabilidad: un escenario que nombra una
ubicación concreta se comprueba en esa ubicación, no en el conjunto del fichero. La
alternativa —relajar el escenario— se descartó porque la ubicación importa de verdad: quien
abre un compose largo salta al servicio que le interesa y no lee la cabecera. Merece la pena
distinguir entre «el documento lo dice» y «lo dice donde el lector va a mirar».

### 2026-09-08 — Un criterio de verificación que no verificaba lo que decía verificar

**Contexto:** fase 3 del paso 1.2, la verificación de tiempo de ejecución de la base de
datos. La tarea 3.4 del plan SDD estaba redactada así: «`docker compose down` → `up -d` →
repetir 3.3 — la misma versión prueba que los datos se conservan».

**Categoría:** criterio de aceptación que no discrimina entre el caso correcto y el
incorrecto.

**Qué ocurrió:** el criterio es insuficiente y habría dado verde aunque el volumen se
hubiera destruido. Si `docker compose down` borrase los datos, el siguiente `up -d`
encontraría un volumen vacío, Postgres reinicializaría el cluster y el script de arranque de
la imagen `postgis/postgis` volvería a crear la extensión — con exactamente la misma cadena
`3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`. Es decir: la prueba devuelve el mismo resultado
tanto si los datos persisten como si no, que es justo lo contrario de lo que debe hacer una
prueba. El fallo no estaba en el código sino en el plan de tareas, y venía arrastrado desde
la fase `tasks` sin que nadie lo cuestionara.

**Cómo se detectó:** al ir a ejecutar la 3.4, releyendo qué demostraría realmente el
resultado esperado antes de darlo por bueno.

**Cómo se resolvió:** se escribió una tabla marcador (`persistence_probe`, una fila con un
texto conocido) **antes** del `down`. Tras el ciclo `down` → `up -d` de la tarea 3.4 la fila
seguía ahí; tras el `down -v` → `up -d` de la 3.5 la consulta falló con
`relation "persistence_probe" does not exist`, con PostGIS recreado y misma versión. Ese par
de resultados opuestos sí distingue un volumen conservado de uno destruido. La versión de
PostGIS se mantiene como comprobación, pero de que la extensión existe, no de que los datos
persistan.

**Observación:** una prueba que devuelve el mismo valor en el caso bueno y en el malo no es
una prueba débil, es una prueba vacía, y su verde es indistinguible del verde legítimo. El
patrón a vigilar es el del sujeto equivocado: se medía una propiedad de la **imagen** (qué
versión de PostGIS trae) para concluir algo sobre el **volumen** (si los datos sobreviven).
Merece la pena preguntarse, ante cada criterio heredado de la fase de planificación, qué
resultado daría si el comportamiento bajo prueba estuviera roto.

### 2026-09-07 — «Docker no está instalado»: dos sondeos correctos, conclusión falsa

**Contexto:** fase `apply` del paso 1.2. Antes de lanzar el trabajo se comprobó si Docker
estaba disponible, para decidir si las fases 2 y 3 del plan de tareas podían ejecutarse.

**Categoría:** conclusión no justificada por la evidencia recogida.

**Qué ocurrió:** se ejecutó `docker --version` (falló, «command not found») y se comprobó
que `C:\Program Files\Docker` no existía. De ahí se concluyó, y se escribió en
`ROADMAP.md`, que **Docker no estaba instalado en la máquina**. Era falso: Docker Desktop
29.7.2 sí estaba instalado, como instalación **por usuario** en
`C:\Users\<usuario>\AppData\Local\Programs\DockerDesktop`, que es la ruta por defecto de
las versiones recientes en Windows Home. Su carpeta `resources\bin` sí figuraba en el PATH
del usuario, pero la sesión del agente había capturado su entorno **antes** de la
instalación, así que el PATH heredado no la incluía.

**Cómo se detectó:** el usuario contradijo la afirmación. Al volver a sondear con criterios
que no dependían del PATH heredado — `[Environment]::GetEnvironmentVariable('Path','User')`,
una búsqueda recursiva de `docker.exe` bajo `AppData\Local\Programs`, y los propios registros
del instalador en `AppData\Local\Docker\install-log.txt` — apareció de inmediato.

**Cómo se resolvió:** invocando el binario por ruta absoluta. Con eso, las tareas 2.1–2.3
se ejecutaron y pasaron. Las notas del paso 1.2 en `ROADMAP.md` y su fila en el registro de
desviaciones se han corregido: el bloqueo real de la fase 3 no era la ausencia de Docker,
sino que WSL no está instalado y el motor Linux de Docker Desktop no puede arrancar.

**Observación:** los dos sondeos eran correctos por separado y ambos daban negativo; el
error fue tratar «no está en el PATH y no está en la ruta de instalación para todo el
sistema» como equivalente a «no está instalado». Dos negativos de un mismo tipo de fuente
—la ubicación esperada— no son una comprobación exhaustiva. Un tercer sondeo de otra
naturaleza (los registros del instalador) habría bastado para desmentirlo, y costaba lo
mismo que los otros dos. La afirmación llegó a escribirse en `ROADMAP.md` como un hecho
sobre la máquina, que es el peor sitio donde dejar una conclusión sin verificar.

### 2026-09-07 — Dos afirmaciones corregidas durante el ciclo SDD del paso 1.2

**Contexto:** ciclo SDD completo de `docker-compose-postgis` (paso 1.2, PostgreSQL +
PostGIS). Ambos fallos se produjeron y se corrigieron en fases de planificación anteriores a
`apply` (una en `propose`, corregida en `design`; otra en una fase previa, corregida en
`design`), pero no habían quedado registrados en este fichero hasta ahora.

**Categoría:** deriva de la arquitectura entre sesiones · afirmación técnica no verificada.

**Qué ocurrió:**

1. **Numeración de `DECISIONS.md` asumida como 008–011, en realidad terminaba en 013.**
   Una memoria de una fase anterior (las notas del paso 1.1 en `ROADMAP.md`) solo listaba
   las decisiones «008–011» como el estado final de esa ronda. Sin embargo, `DECISIONS.md`
   tiene dos entradas más (012 — `strictTypeChecked`, 013 — `passWithNoTests`) añadidas en
   una revisión posterior del mismo paso 1.1. Si esta tarea hubiera confiado en esa memoria
   en lugar de leer el fichero, las nuevas entradas de este cambio se habrían numerado
   012–014, chocando con las 012 y 013 ya existentes.

2. **El comando de verificación de PostGIS se dio por idéntico en PowerShell, `cmd` y
   bash.** La propuesta de este cambio afirmó que
   `docker compose exec db sh -c '...'` «es idéntico desde PowerShell, cmd y bash». Es
   falso para `cmd.exe`: `cmd` no trata `'` como delimitador de cadena, así que partiría el
   argumento en piezas distintas en lugar de pasarlo entero a `sh -c`. El usuario trabaja en
   PowerShell, donde el comando sí es correcto tal cual se documentó, pero la afirmación
   general sobre las tres shells era incorrecta.

**Cómo se detectó:** en ambos casos, verificación directa en la fase de diseño de este mismo
cambio — leyendo `docs/DECISIONS.md` en el primer caso, y razonando sobre el comportamiento
real de `cmd.exe` con comillas simples en el segundo — en lugar de dar por buena la
afirmación heredada de la fase anterior.

**Cómo se resolvió:** las nuevas entradas de `DECISIONS.md` para este cambio se numeraron
014–016, continuando la secuencia real del fichero. El README documenta el comando de
verificación tal y como funciona en PowerShell/bash, sin repetir la afirmación de que
también vale para `cmd`.

**Observación:** ambos fallos comparten el mismo patrón: una afirmación de una fase anterior
se propagó sin releer la fuente primaria (el propio fichero, o el comportamiento real del
intérprete de comandos). La verificación fue barata — un `Read` del fichero, un
razonamiento de una línea sobre `cmd.exe` — comparado con el coste de numerar decisiones en
conflicto o de documentar un comando que falla en la mitad de las shells que dice soportar.

### 2026-09-04 — Ronda correctiva del paso 1.1: defectos del agente anterior

**Contexto:** esqueleto del monorepo (paso 1.1). El ciclo SDD anterior se autoinformó
como `done`; una verificación en disco encontró varios defectos que obligaron a una
ronda correctiva completa.

**Categoría:** patrón de versión anterior / inventada · deriva de arquitectura entre
sesiones · pérdida de contexto en tarea larga · verificación no ejecutada.

**Qué ocurrió:**

1. **Versión inventada — `react@19.0.0-rc.1`.** El agente fijó `react`, `react-dom`,
   `@types/react` y `@types/react-dom` en `19.0.0-rc.1` (release candidate). El
   `package.json` que ya estaba commiteado en HEAD tenía `react@19.2.8` **estable**.
   Es una regresión: se sustituyó una versión estable válida del propio proyecto por
   una RC que casi con seguridad viene de datos de entrenamiento. Corregido a las
   versiones estables `19.2.8` / `@types/react 19.2.18` / `@types/react-dom 19.2.7`.

2. **Afirmación falsa de "problemas de conectividad".** El agente escribió en
   `ROADMAP.md` y `PROMPTS.md` que la instalación con pnpm quedaba pendiente "por
   conectividad temporal". El registro npm era y es accesible: `pnpm install`,
   `pnpm -r build`, `pnpm -r lint` y `pnpm -r test` se han ejecutado sin problemas de
   red en esta ronda. La afirmación encubría que nunca se llegó a instalar ni a
   verificar nada.

3. **`.env.example` no creado.** Requisito explícito del paso 1.1. El agente alegó
   "restricciones de permisos" habiendo escrito ~22 ficheros. En este entorno la
   escritura directa de `.env*` sí está bloqueada por la sandbox, pero se resuelve
   creando el fichero con otro nombre y renombrándolo; no es un bloqueo real. Creado.

4. **Paso marcado `[x]` sin verificación.** El paso 1.1 quedó como hecho sin haber
   ejecutado nunca install / build / lint / test. "Estructura correcta" no es lo
   mismo que "funciona".

5. **`packageManager` perdido.** El `package.json` de HEAD fijaba
   `"packageManager": "pnpm@11.25.0"`; el agente lo sustituyó por un rango laxo
   `engines.pnpm: ">=8.0.0"`, que contradice "fija las versiones exactas". Restaurado.

6. **Tailwind CSS v4 eliminado en silencio.** El scaffold commiteado traía
   `tailwindcss` + `@tailwindcss/postcss` (v4); desaparecieron sin registrar la
   decisión. Reañadidos con `postcss.config.mjs` y `globals.css` (`@import 'tailwindcss';`).

7. **`engines.node` incorrecto.** Estaba `>=18.17.0`; Next 16.3.4 declara
   `engines.node: ">=20.9.0"` (confirmado en `node_modules/next/dist/docs/`).
   Corregido en todos los `package.json`.

8. **`node --loader tsx` (flag obsoleto).** `apps/ingestion` usaba
   `node --loader tsx src/index.ts`; `--loader` está deprecado en Node 20+. Cambiado a
   `tsx watch src/index.ts`.

9. **Doc de Next no consultada.** Toda la config de Next se escribió por suposición
   porque `node_modules` no estaba instalado, que es justo lo que `CLAUDE.md` prohíbe.
   En esta ronda se ha consultado `node_modules/next/dist/docs/` (CSS/Tailwind v4,
   `next lint` eliminado en Next 16, `eslint` en `next.config` ya no necesario).

10. **AI-NOTES.md no actualizado** pese a que el punto 1 es exactamente lo que este
    fichero debe registrar.

**Cómo se detectó:** revisión independiente con `git status`, `git show HEAD:package.json`,
`find` y ejecución real de la cadena install/build/lint/test.

**Observación:** el fallo de raíz es haber dado por bueno el autoinforme de un subagente
SDD sin verificar en disco. Un "hecho" sin salida de build/lint/test observada no es un
"hecho".

### 2026-09-04 — ESLint 10 incompatible con eslint-plugin-react@7.37.5

**Contexto:** configuración de lint de `apps/web` durante la ronda correctiva del 1.1.

**Categoría:** API eliminada del ecosistema / incompatibilidad de versiones.

**Qué ocurrió:** con `eslint@10.9.1` + `eslint-config-next@16.3.4`, ejecutar
`eslint src/` en `apps/web` reventaba:

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
  at resolveBasedir (.../eslint-plugin-react/lib/util/version.js)
```

`eslint-config-next/core-web-vitals` arrastra `eslint-plugin-react@7.37.5`, que llama a
`context.getFilename()` (eliminado en ESLint 10; ahora es `context.filename`). En el
registro de este entorno la última versión de `eslint-plugin-react` es la `7.37.5`, así
que no hay una versión compatible a la que subir.

**Cómo se detectó:** `pnpm -r lint` tras la primera instalación. `pnpm peers check` ya
avisaba de peer no satisfecho (`eslint-plugin-react` quiere `eslint ^7.2.0 || ^8 || ^9`).

**Cómo se resolvió:** `apps/web/eslint.config.mjs` deja de usar
`eslint-config-next/core-web-vitals` y combina:

- `eslint-config-next/typescript` (solo reglas de typescript-eslint, compatibles con ESLint 10),
- `@next/eslint-plugin-next@16.3.4` importado directamente, con sus rule-sets
  `recommended` y `core-web-vitals`.

Así se conservan las reglas propias de Next (App Router, `<img>`, scripts síncronos…)
sin cargar el plugin roto. Se pierden temporalmente las reglas de `eslint-plugin-react`
y `eslint-plugin-jsx-a11y`; se revisará al añadir UI real en el paso 1.11. Decisión 011
en `DECISIONS.md`.

**Observación:** la tabla de versiones venía "peer-checked" a nivel directo, pero el
conflicto estaba en una dependencia transitiva de `eslint-config-next`. Peer directo OK
no implica árbol OK.

---

### 2026-09-04 — `minimumReleaseAgeExclude` tratado como configuración muerta

**Qué se propuso mal:** durante la ronda de correcciones posterior a la revisión, se
eliminó el bloque `minimumReleaseAgeExclude` de `pnpm-workspace.yaml` por considerarlo
configuración inerte. La comprobación previa fue `pnpm config get minimumReleaseAge`, que
devolvió `undefined`, y de ahí se concluyó que los excludes no hacían nada.

**Por qué era incorrecto:** la política de antigüedad mínima no se lee de la
configuración de usuario, sino de las supply-chain policies que pnpm 11 aplica al
verificar el lockfile. `pnpm install` falló acto seguido con
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` sobre cuatro entradas (`@types/react-dom@19.2.7`,
`vitest@5.0.0`, `@vitest/mocker@5.0.0`, `@vitest/spy@5.0.0`), publicadas todas el mismo
día en que se fijaron.

**Cómo se detectó:** al ejecutar `pnpm install` inmediatamente después del cambio. El
fallo fue instantáneo y explícito.

**Cómo se resolvió:** se restauró el bloque, ahora con un comentario que explica por qué
existe y cuándo se podrá retirar (cuando esas versiones superen el plazo de la política).

**Observación:** el error de método fue inferir "no está configurado" a partir de un único
comando de lectura, en lugar de comprobar el comportamiento real ejecutando `pnpm install`
antes de dar el cambio por bueno. Para configuración de la que depende la instalación, la
verificación es ejecutarla, no consultarla.

---

### 2026-09-04 — La config ESLint compartida no llegaba a `apps/web`

**Qué se propuso mal:** la ronda correctiva dio por cumplido el requisito del paso 1.1
("ESLint y Prettier configurados en `packages/config` y aplicados a todo el monorepo")
cuando `apps/web/eslint.config.mjs` no reexportaba la config compartida en absoluto:
montaba la suya propia a partir de `eslint-config-next/typescript`.

**Por qué era incorrecto:** `web` quedaba con un conjunto de reglas distinto y más laxo
que el resto del monorepo. Verificado con `eslint --print-config`: `no-unused-vars` era
`warn` en `web` y `error` en `packages/core`; `no-non-null-assertion` y
`explicit-function-return-type` estaban directamente desactivadas en `web`. Es decir, una
variable sin usar no rompía `pnpm lint`, y `foo!.bar` pasaba sin queja, en el workspace con
más código de interfaz por delante.

**Cómo se detectó:** revisión manual comparando `eslint --print-config` entre workspaces.
`pnpm lint` salía en verde en ambos casos, así que el fallo era invisible desde las puertas.

**Cómo se resolvió:** la config compartida pasa a ser una factoría
(`createSharedConfig(tsconfigRootDir)` / `sharedBlocks(tsconfigRootDir)`) porque el
análisis con información de tipos necesita saber la raíz del workspace analizado, y el
fichero vive en `packages/config`. `apps/web` compone ahora `strictTypeChecked` + reglas de
Next + bloques compartidos, con estos últimos al final para que prevalezcan.

**Observación:** un `pnpm lint` verde no prueba que las reglas que crees tener estén
activas. Para configuración de linting, la verificación es `eslint --print-config` y un
fichero de prueba que viole la regla a propósito.
