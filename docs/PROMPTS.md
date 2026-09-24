# Prompts

Registro de prompts que funcionaron bien y de los que no, con su contexto. Material para el
capítulo de proceso de la memoria.

Interés principal: comparar formas de especificar la misma tarea. Los adaptadores son el
caso más claro, porque se repite la misma estructura varias veces y permite contrastar dar
la interfaz y un ejemplo previo frente a describir el comportamiento en prosa.

---

## Plantilla

```markdown
### [fecha] — Tarea

**Tipo de tarea:** adaptador · dominio · interfaz · test · configuración · consulta SQL
**Forma de especificación:** contrato + ejemplo · prosa · iterativo · referencia a fichero
**Resultado:** utilizable sin cambios · con retoques · descartado
**Prompt:**

> ...

**Observación:** qué funcionó o faltó.
```

---

## Registro

<!-- Añadir entradas nuevas arriba, en orden cronológico inverso -->

### 2026-09-19/22 — Cobertura bajo demanda (1.13), ciclo SDD completo en cuatro unidades de trabajo secuenciales

**Tipo de tarea:** interfaz + consulta SQL + migración de esquema + worker/daemon + importador de
datos geográficos + esquema Zod
**Forma de especificación:** ciclo SDD completo — explore → research → propose → `sdd-spec` y
`sdd-design` en paralelo → arbitraje del orquestador → `sdd-tasks` → `sdd-apply` en cuatro
unidades secuenciales (catálogo → presupuesto → worker → interfaz web)
**Resultado:** utilizable con retoques — una re-ejecución correctiva real (unidad B) y una ronda
de arbitraje con cinco contradicciones reales entre especificación y diseño
**Prompt:**

> Implementa el mecanismo de cobertura bajo demanda de `docs/ARCHITECTURE.md`: resolución de la
> ubicación introducida a un identificador canónico de zona, para que distintas formulaciones de
> la misma zona no generen barridos duplicados; autocompletado de ubicación en la interfaz sobre
> zonas canónicas, en lugar de texto libre; si la zona no está cubierta, se registra un
> `coverage_job` y la interfaz muestra el estado del proceso hasta que termina; el worker consulta
> `coverage_jobs` periódicamente y ejecuta barrido, normalización y deduplicación de la zona;
> presupuesto diario de peticiones y tope de zonas nuevas por día y por sesión, con degradación
> explícita al alcanzarlo.

**Observación:** el cambio más grande del proyecto hasta la fecha, en cuatro paquetes a la vez y
sin precedente propio para tres de sus piezas (importación geográfica masiva, worker de larga
duración, presupuesto persistente entre invocaciones). `sdd-spec` y `sdd-design` se ejecutaron en
paralelo y produjeron cinco contradicciones reales, no falsos conflictos, arbitradas por el
orquestador (obs #217) a favor del diseño en los cinco casos — siempre porque el diseño había
leído el código real y la especificación había razonado desde la prosa de la propuesta. La más
seria (CR-15): el escenario de Granada que la especificación proponía habría probado la propia
regresión que debía impedir bajo el mecanismo de fusión real del catálogo.

La unidad B (presupuesto diario) necesitó una **re-ejecución correctiva real**, no cosmética: la
verificación independiente del orquestador, antes de asentar el trabajo, encontró que el tope no
se aplicaba en la primera reserva de cada día UTC — el propio hueco ya estaba en el SQL literal
del diseño (DD-12), no solo en la implementación. Corregido con evidencia contra Postgres real,
incluido un segundo defecto anidado (comparación de parámetros sin tipar como texto) hallado al
probar la primera corrección. Detalle completo en `docs/AI-NOTES.md`, misma fecha.

Las cuatro unidades quedan completas salvo dos tareas exclusivas del responsable del proyecto
(aprovisionar un segundo rol de PostgreSQL y ejecutar el test que lo comprueba), por lo que el
paso se cierra en `[~]`, no `[x]`, y `sdd-verify` queda como siguiente fase. Detalle de tareas,
evidencia TDD y desviaciones por unidad en Engram: `sdd/on-demand-coverage/tasks` (obs #219),
`apply-progress` (obs #220), `apply-progress-2` (obs #223), `apply-progress-3` (obs #226).

### 2026-09-17 — Búsqueda y listado en Next (1.11), cierre: ejecutar la aplicación encuentra lo que 715 tests en verde no encontraban

**Tipo de tarea:** corrección + test
**Forma de especificación:** iterativo (continuaciones cortas: «continúa», «resetea y verifica»)
**Resultado:** utilizable con retoques

**Observación:** esta entrada cubre el tramo posterior al primer lote de `sdd-apply`, donde la
forma de trabajo dejó de ser «especificar» y pasó a ser «ejecutar y mirar». El dato del paso:

Con 715 tests en verde, typecheck limpio y lint en exit 0, la búsqueda **no había funcionado
nunca**. La subconsulta del recuento de fuentes emitía un `"id"` sin cualificar y Postgres la
rechazaba con 42702. Los 21 tests de `.toSQL()` que la cubrían pasaban igual con el SQL roto y
con el corregido, porque comparan la forma de la cadena emitida y no la ejecutan. El fallo
apareció al arrancar `next start` y pedir la página: las URL válidas daban 500 y las inválidas
200, porque estas últimas ni llegaban a la base de datos.

Dos defectos más aparecieron por el mismo método —construir y ejecutar, no razonar—: un import
con sufijo `.js` que `tsc` acepta y Turbopack no, y un `${VAR:?...}` en el compose que abortaba
la interpolación del fichero entero.

Después, `sdd-verify` devolvió `fail` con 3 bloqueantes: escenarios de la especificación sin
ningún test que los ejecutara. Verificó de forma independiente los 715 tests, rehízo dos
sabotajes por su cuenta y **desmintió una afirmación del informe de implementación** (decía tener
un test de `page=101` que no existía). Los tres huecos se cubrieron después, cada uno verificado
en rojo.

Lección para la memoria: en este paso, el valor marginal de un test más de construcción de
consulta era cero, y el de ejecutar la aplicación una sola vez fue encontrar tres defectos, uno
de ellos total. La instrucción que más rindió no fue una especificación: fue «continúa» seguido
de mirar la salida real.

### 2026-09-17 — Búsqueda y listado en Next (1.11), implementación (`sdd-apply`) sobre la planificación ya cerrada

**Tipo de tarea:** interfaz + consulta SQL + esquema Zod + migración de esquema + script de backfill
**Forma de especificación:** ciclo SDD completo — tareas persistidas (39, obs #177) sobre spec
revisión 2 (obs #174), diseño (obs #173) y arbitraje (obs #175) ya cerrados en la sesión previa
**Resultado:** utilizable con retoques (dos bloqueos de infraestructura, no de especificación)
**Prompt:**

> Ejecuta `sdd-apply` para `web-search-listing` (ROADMAP 1.11) en modo TDD estricto, con la
> corrección explícita de exigir un paso "verificar en rojo" en cada aserción estructural
> (romper la implementación a propósito, confirmar el fallo exacto, revertir) — dos aserciones
> vacuas ya se habían colado en verde en los pasos 1.8 y 1.9 de este mismo proyecto.

**Observación:** las 39 tareas se implementaron y typecheckearon limpias en los cuatro
workspaces tocados (`packages/core`, `packages/db`, `apps/ingestion`, `apps/web`), con el ciclo
RED→GREEN real (no simulado) en cada tarea con test asociado. El paso "verificar en rojo" se
ejecutó de verdad cinco veces (clasificación de `thumbnailUrl`, import prohibido del backfill,
rescate `OR IS NULL` en el filtro de precio/operación, directiva `'use client'`, import
prohibido de `page.tsx`) — todas confirmaron el fallo esperado antes de revertir. Dos bloqueos,
ninguno de especificación: (1) Docker Desktop no está disponible en este entorno, así que
ninguna suite respaldada por PostgreSQL real pudo ejecutarse, ni las nuevas ni las que ya
existían antes de este cambio; (2) el rol de PostgreSQL de solo lectura de `apps/web` sigue
siendo un prerrequisito exclusivo del mantenedor. Ambos se registran honestamente como
bloqueados en vez de fingir una verificación que no ocurrió. Ver la tabla de desviaciones.

Un hallazgo de diseño propio durante la implementación, no anticipado por el diseño: la
aserción "`projectToVersionColumns` produce el mismo resultado para dos `Listing` que solo
difieren en `thumbnailUrl`" es estructuralmente incapaz de fallar si se sabotea la
CLASIFICACIÓN del campo en `listing-field-policy.ts` (esa función nunca consulta la política);
solo falla si se sabotea la propia función de proyección. Corregido antes de reportar verde.
Ver `AI-NOTES.md`.

### 2026-09-16 — Búsqueda y listado en Next (1.11), planificación completa; el spec y el diseño en paralelo vuelven a destapar una contradicción

**Tipo de tarea:** interfaz + consulta SQL + configuración
**Forma de especificación:** prosa estructurada (lista de requisitos) + restricción negativa explícita
**Resultado:** utilizable con retoques (una re-ejecución correctiva del spec)
**Prompt:**

> Implementa la búsqueda en apps/web: página de resultados como Server Component que consulta
> packages/db directamente, sin capa de fetching en cliente. Filtros en search params
> (operación, ubicación, rango de precio, rango de superficie, habitaciones, baños, tipo de
> inmueble), validados con Zod. Ordenación por precio, superficie y fecha de actualización.
> Cada resultado muestra los datos consolidados y en cuántas fuentes aparece. Imágenes remotas
> mediante la optimización de imágenes de Next, con los dominios de la fuente configurados.
> Nada de TanStack Query ni Zustand. El estado de búsqueda vive en la URL.

**Observación:** el prompt es corto y su parte más útil es la **restricción negativa** del final
("nada de TanStack Query ni Zustand"). Nombrar lo prohibido cerró de entrada toda una rama de
diseño sin gastar una sola pregunta. La parte más cara fue la opuesta: "ubicación" y "los
dominios de la fuente" se leían como requisitos triviales y ninguno lo era. `locationId` está
a `NULL` en el 100 % de las filas reales, y no había ninguna URL de imagen persistida en todo
el pipeline. Ambos huecos solo aparecieron al mirar los datos, no al leer el prompt.

Tres decisiones de producto se escalaron en **un único prompt agrupado** antes de la propuesta,
con la alternativa descartada y su coste en cada una: frontera de credenciales, alcance de las
imágenes y mecanismo del filtro de ubicación. Agruparlas evitó tres paradas sucesivas.

`sdd-spec` y `sdd-design` corrieron en paralelo por segunda vez en el proyecto (la primera fue
el 1.10). El diseño declaró 10 riesgos de contradicción y la especificación 5 supuestos: de los
15, **13 eran falsas alarmas** — ambos agentes habían llegado por su cuenta a la misma
conclusión. El coste del cruce fue bajo precisamente porque los dos declararon sus supuestos por
adelantado. Ver `AI-NOTES.md`, entrada del 2026-09-16 sobre la contradicción interna del spec.

**Estado al cierre:** planificación completa (explore, propuesta, spec revisión 2, diseño,
arbitraje). Sin `sdd-tasks` ni implementación: se detuvo a petición del usuario por cuota, en un
límite limpio, en lugar de dejar la implementación a medias.

### 2026-09-15/16 — Consolidación de viviendas canónicas (1.10), ciclo SDD completo, spec y diseño en paralelo con una contradicción arbitrada

**Tipo de tarea:** dominio puro (agrupación por unión-búsqueda + selección de ganador) +
capa de hidratación y escritor transaccional en `packages/db` + comando de CLI de reproceso
en `apps/ingestion`, primer paso del arco que escribe `properties`/`property_listings` en
producción
**Forma de especificación:** ciclo SDD completo sobre el prompt del ROADMAP 1.10 verbatim.
Exploración → ocho decisiones de producto confirmadas por el responsable del proyecto
(Q0-Q7, obs #158) → propuesta (obs #159) → **spec y diseño en paralelo** (obs #161/#160),
que produjo una contradicción real entre ambos artefactos, arbitrada por el orquestador
antes de `sdd-tasks` (obs #162) → tareas (obs #163, 54 tareas en 6 fases) → cuatro batches
de `sdd-apply` con revisión del responsable del proyecto entre cada uno. Cambio
`canonical-property-consolidation`. `size:exception` aceptado explícitamente
(`delivery_strategy: exception-ok`, sesión completa) tras un pronóstico de diseño de
~2455 líneas (rango 2300-2900) frente al presupuesto de 800, entregado como una única PR con
cuatro unidades de trabajo a nivel de commit (A: esquema/migraciones, B: algoritmos puros de
`core`, C: hidratación+escritor de `db`, D: CLI+eslint+docs+verificación final)
**Resultado:** con retoques — la especificación previa (Q0-Q7 + arbitraje) resolvió por
adelantado los puntos de producto más delicados, y ninguna de las cuatro correcciones que
ocurrieron durante `apply` llegó a afectar código de producción ya escrito y comprometido:
las cuatro son correcciones de proceso o de infraestructura de test detectadas y resueltas
dentro del mismo batch en el que aparecieron, no regresiones descubiertas después. Se
informa así explícitamente en vez de como «utilizable sin cambios», porque hubo una
arbitración sustantiva de contradicción y cuatro correcciones en vuelo, aunque ninguna
sobreviviera al código final

**Prompt:**

> Implementa la fase que agrupa listings en properties a partir de las decisiones
> del deduplicador, y consolida los valores de la vivienda canónica.
>
> El precio mostrado es el más económico del grupo. El resto de atributos se toman
> del anuncio más completo y actualizado. Se conserva el acceso individual a cada
> anuncio de origen.
>
> Añade un comando para reprocesar la deduplicación completa sobre los datos ya
> ingeridos, sin llamar a ninguna fuente externa.

**Observación:** la contradicción arbitrada (obs #162) es el dato más interesante de esta
sesión para el proceso SDD en sí. `sdd-spec` y `sdd-design` corrieron en paralelo, cada uno
internamente coherente, y discreparon en un punto que ninguno de los dos poseía por sí
solo: si un anuncio sin duplicado detectado («singleton») es también una vivienda que merece
su propia fila en `property_listings`. La especificación original (revisión 1) lo negaba,
razonando desde `property_listings` como tabla de coincidencias reales; el diseño lo exigía
(D6), razonando desde que `score`/`signals` son `NOT NULL` en esa tabla. El criterio de
desempate no estaba en ninguno de los dos artefactos: fue leer el consumidor aguas abajo
—ROADMAP 1.11 consulta `properties`, no `listings`— cruzado con la medición ya hecha en la
exploración (50 códigos de anuncio distintos entre 50 anuncios reales, obs #142): bajo la
lectura de la especificación, casi ningún anuncio real habría tenido fila en `properties` y
la página de resultados de 1.11 habría vuelto vacía. El diseño ganó el arbitraje y la
especificación recibió su única re-ejecución correctiva (revisión 2).

Las cuatro correcciones en vuelo durante `apply`, ninguna alcanzó código de producción ya
escrito: (1) las tareas 1.7/1.8 (decisiones 051/055) se difirieron erróneamente a la fase 5
por una instrucción de batch que contradecía la ubicación que las propias tareas ya les
daban en la fase 1 — corregido dentro de la misma unidad, antes de empezar la fase 2; (2) el
texto literal de la tarea 3.1 especificaba un solo fichero de `setupFiles` para la config de
vitest de consolidación, que habría hecho fallar la suite incondicionalmente en vez de
fallar-alto-solo-cuando-falta — corregido para igualar el precedente real de 1.8
(`vitest.blocking.config.ts:17`, dos ficheros) antes de escribir ningún test; (3) el
`truncateAll()` de test compartido (`packages/db/test/helpers/db-client.ts`, del paso 1.7)
no incluía las dos tablas nuevas en su lista de orden FK, descubierto por un recuento
absoluto de filas que fallaba en la propia fase 3 — corregido, sin regresión en las suites
1.7-1.9; y (4) el mismo defecto se encontró proactivamente, antes de que causara un fallo,
en la copia del arnés de `apps/ingestion` durante la fase 4. Ninguna de las cuatro fue
detectada por una puerta automática en verde: las tres primeras salieron de leer el propio
texto de la tarea contra su precedente citado, y la cuarta de aplicar la lección de la
tercera por adelantado.

La sesión confirmó también, de primera mano contra el contenedor real, que el corpus de 50
anuncios reales de Idealista (obs #142) desapareció de la base de datos de desarrollo
—`listings`, `listing_versions`, `properties`, `sources` en cero filas— casi con toda
certeza por la propia decisión 046 (sin base de datos de test separada) combinada con el
número de ejecuciones de suite contra base de datos real que este cambio, el más grande del
arco, disparó en una sola sesión. El agrupamiento no trivial (D2/D3) queda demostrado contra
datos sembrados a propósito (Unidad B: 18 tests puros; Unidad C: 14 tests de integración),
nunca contra el corpus real, que ya no existe para volver a intentarlo sin gastar cuota de
nuevo.

### 2026-09-15 — Estrategia de puntuación basada en reglas (1.9), ciclo SDD completo en un solo batch de `sdd-apply`

**Tipo de tarea:** dominio puro (señales estructuradas + acumulación ponderada + bandeado) +
corpus de test etiquetado, íntegramente en `packages/core`, sin I/O
**Forma de especificación:** ciclo SDD completo (explore → preproposal → proposal → spec →
design → tasks → apply) bajo Strict TDD, sobre el prompt del ROADMAP 1.9 verbatim. Cambio
`rule-based-dedup-strategy`. `size:exception` aceptado explícitamente por el responsable del
proyecto (obs #151) tras revisar el pronóstico de ~1530 líneas frente al presupuesto de 800,
con la partición por fases A→B1→B2→C de `sdd-tasks` conservada como la historia de commits
dentro de la única PR, no como PRs encadenadas.
**Resultado:** utilizable sin cambios

**Prompt:**

> Implementa la primera DedupStrategy basada en reglas sobre datos estructurados, según los
> criterios de docs/DECISIONS.md (decisión 006). Decisión por acumulación de señales;
> ninguna señal decide por sí sola. La dirección solo cuenta como señal fuerte si la
> coincidencia es exacta. Sin comparación de imágenes en esta fase. El resultado incluye
> siempre el desglose por señal, que se persiste en property_listings junto con la decisión
> y el nombre de la estrategia. Añade tests con pares etiquetados, incluyendo negativos
> difíciles: anuncios del mismo bloque con superficie y precio similares que son viviendas
> distintas.

**Observación:** las 41 tareas de `sdd-tasks` se ejecutaron en un solo batch, ciclo RED→GREEN
completo por tarea, sin ningún ajuste a la lógica de producción una vez escrita — los únicos
ajustes fueron en los propios tests: dos casos de `scorePrice`/`scoreSurface` con la
aritmética del ratio mal calculada a mano (`|pa-pb|/max(pa,pb)`, no sobre el valor base), y
un caso de `BAND-1a` reescrito para fijar `score` como literal exacto en vez de reconstruirlo
por álgebra inversa, evitando fragilidad de punto flotante en una comparación de frontera.
El corpus de 24 pares se diseñó primero a mano contra la fórmula del diseño, se verificó con
un test diagnóstico temporal que imprimía el score real de cada par (`console.log`, fichero
borrado antes de commitear), y los 24 aterrizaron en la banda esperada a la primera — sin
necesitar retocar ningún peso ni umbral para que el corpus "pasara". El escenario de spec
CORP-3b (par idéntico → `undecided`) llegó ya corregido a `accept` por la adjudicación del
propio ciclo SDD (obs #148) antes de `apply`, así que no hubo ninguna sorpresa de spec
insatisfacible en esta fase — solo la ejecución de lo ya decidido.

### 2026-09-14/15 — Bloqueo de candidatos (1.8), ciclo completo en dos batches de `sdd-apply`

**Tipo de tarea:** consulta SQL (autojoin + índices) + comando de CLI de calibración + tipos
puros en `core`
**Forma de especificación:** ciclo SDD completo (explore → preproposal → proposal → spec →
design → tasks → apply) bajo Strict TDD, sobre el prompt del ROADMAP 1.8 verbatim. Cambio
`candidate-blocking`. `size:exception` aceptado explícitamente por el responsable del proyecto
(obs #130) tras revisar el pronóstico de ~1345 líneas frente al presupuesto de 800
**Resultado:** utilizable con retoques — la implementación entera pasó las fases 1-4 y 5
(documentación) en verde, pero el diseño original del autojoin (`D-Q1`, `alias()` +
`lt(a.id,b.id)` como condición de `JOIN`) resultó insuficiente contra PostgreSQL real y tuvo
que reescribirse dos veces en tiempo de `apply` (ver decisiones 042-043) hasta encontrar una
forma que de verdad forzara el uso del índice GiST. `sdd-apply` se ejecutó en dos batches: el
primero interrumpido por un límite de tasa del proveedor a mitad de la fase 2, el segundo
retomado verificando el árbol de trabajo real en vez de confiar en el checkpoint de progreso
persistido (que resultó estar desactualizado en varios puntos). **`sdd-verify` devolvió FAIL en
la primera pasada**: la aserción negativa de `CHK-GIST-SELFJOIN` era vacua (buscaba una subcadena
que el `EXPLAIN` en formato JSON no emite nunca), de modo que una prueba incapaz de fallar se
había citado como demostración en tres artefactos. Corregida y validada poniéndola en rojo a
propósito; la re-verificación cerró el hallazgo en `pass_with_warnings`, sin bloqueos. El retoque
más caro del ciclo no fue código de producción, sino una prueba que no probaba nada

**Prompt:**

> Implementa la fase de bloqueo de la deduplicación en packages/core y packages/db:
> generación de pares candidatos mediante consulta SQL, por proximidad geográfica,
> banda de precio y margen de superficie, usando el índice espacial.
>
> Los umbrales deben ser parámetros configurables, no constantes en el código:
> se van a ajustar empíricamente sobre los datos.
>
> Añade un comando que, sobre los datos ya ingeridos, muestre cuántos pares
> candidatos genera cada combinación de umbrales, para poder calibrarlos.

**Observación:** el prompt en sí especifica bien el QUÉ (proximidad + precio + superficie +
umbrales configurables + CLI de calibración), pero no podía anticipar el CÓMO a nivel de
planificador de consultas: la forma "obvia" del autojoin (dos alias, un `JOIN` con `lt(a.id,
b.id)`) es correcta funcionalmente y pasó toda la suite de corrección (16/16), pero el
planificador de PostgreSQL la reordenaba libremente y nunca llegaba a usar el índice GiST que
el paso 1.3 había creado exactamente para esto. Hicieron falta tres restructuraciones
sucesivas, cada una medida contra `EXPLAIN (ANALYZE, FORMAT JSON)` real, no asumida por
lectura del SQL generado — la última (subconsulta `LATERAL` correlacionada + `.limit()` como
barrera de optimización) fue la única que funcionó, y reveló además un defecto real en
Drizzle 0.45.2 (`.offset(0)` no se renderiza nunca, ver `docs/AI-NOTES.md`). El otro coste
notable: la propia suite de tests truncó el corpus real de 50 anuncios ingeridos en la
aceptación del paso 1.7, un problema preexistente de la infraestructura de test que este paso
no introdujo pero sí sufrió (decisión 046, `docs/AI-NOTES.md`).

### 2026-09-14 — Persistencia y barrido de una zona (1.7), fase 1 de 4

**Tipo de tarea:** persistencia + comando de CLI (núcleo puro de barrido, comparador de
versiones, cursor de reanudación)
**Forma de especificación:** ciclo SDD completo (`/gentle-sdd-new`: explore → research →
propose → spec + design en paralelo → tasks → apply) bajo Strict TDD, sobre el prompt del
ROADMAP 1.7 verbatim y la base del paso 1.6 (adaptador y normalizador de Idealista). Cambio
`zone-sweep-persistence`
**Resultado:** planificación utilizable sin cambios; implementación completa (fases 1-4) y en
verde, con tres correcciones previas a escribir código más una deriva detectada al
implementar. Pendiente, deliberadamente, solo la ejecución de aceptación contra la API real
(gasta cuota facturable; queda para el responsable del proyecto)

**Prompt:**

> Implementa el pipeline de ingesta hasta la tabla listings: barrido de una zona,
> normalización y escritura, respetando que listings no se sobrescribe sino que se
> versiona.
>
> Añade un comando de CLI en apps/ingestion para lanzar el barrido de una zona
> concreta, con la zona y el tope de peticiones como parámetros.
>
> El barrido debe ser idempotente: ejecutarlo dos veces sobre la misma zona no puede
> duplicar registros ni generar versiones nuevas si nada ha cambiado.

**Observación:** el prompt es de los mejores especificados del proyecto —tres requisitos, uno
de ellos (la idempotencia) formulado como propiedad comprobable y no como tarea— y aun así
la planificación tuvo que cerrar seis decisiones de producto que el prompt no podía contener,
empezando por la más básica: **qué es «una zona»**. No hay geometría asociada a un municipio
en este esquema, así que el barrido se especifica con `--center` y `--radius` explícitos y
`--zone` queda como etiqueta de registro. Un prompt bien escrito no vuelve completa una
especificación que depende de datos que el repositorio no tiene todavía (decisiones 036–040).

El dato interesante de la sesión es **dónde se cazaron los fallos**. Tres errores murieron en
fases de planificación, antes de escribir una línea, y los tres eran invisibles para
cualquier puerta automática: una dependencia de runtime que la propuesta declaró inexistente
y que el `package.json` real desmiente; un redondeo entre `z.number()` del dominio y las
columnas `integer`/`smallint` que habría insertado una versión nueva en cada barrido —es
decir, habría roto en silencio **justo el requisito que este paso existe para cumplir**—; y
una puerta de tests de base de datos que, copiada del paquete vecino, habría saltado el 100%
de los tests informando verde para siempre. El cuarto, una deriva entre la prosa de las
tareas y la tabla del diseño (tres columnas de identidad frente a cuatro), salió al
implementar. Los cuatro, en `AI-NOTES.md`. Contraste con el paso 1.6: allí `sdd-tasks` llegó
a `apply` con los conflictos ya reconciliados; aquí fue `sdd-design` quien hizo el trabajo de
verificación, releyendo ficheros reales en vez de heredar las afirmaciones de `sdd-propose`.

Lo entregado es la fase 1 y solo la fase 1: ocho módulos puros en `apps/ingestion/src/sweep/`
y siete ficheros de test, 72 tests nuevos, TDD estricto, `198/198` en verde verificado de
forma independiente y sin una sola llamada de red ni acceso a base de datos. Las fases 2 a 4
(33 tareas) están bloqueadas porque Docker Desktop no está arrancado en esta máquina — el
tercer paso del proyecto que se parte por el mismo motivo, después del 1.2 y del 1.3. Vale la
pena anotarlo como patrón y no como incidente: la parte del trabajo que se puede especificar
y probar sin infraestructura es sistemáticamente mayor de lo que parece al empezar, y el
límite reaparece siempre en el mismo sitio.

**Cierre (mismo prompt, sesiones posteriores).** Con el contenedor ya disponible, las fases
2 a 4 se completaron en tres sesiones encadenadas de `sdd-apply`. La segunda de ellas se
interrumpió por el límite de tasa de una API externa antes de dejar su propio registro de
progreso —el primer corte de este proyecto que no viene de Docker ni de una decisión de
producto pendiente, sino de un límite de un proveedor externo—; la sesión siguiente verificó
el estado resultante contra la base de datos real en vez de asumirlo. La fase 4 resolvió el
único dato real que le faltaba al diseño —el código INE de Granada— pidiéndoselo al usuario
en vez de recordarlo o inventarlo (decisión de producto P5: fabricar ese código estaba
prohibido explícitamente). Verificación final: suite offline 198/198, suite contra
PostgreSQL 25/25 más 14 tests nuevos del seed en `packages/db`, cero llamadas a la API real
en cualquier test. Deliberadamente sin cerrar: la ejecución de aceptación contra la API real
de Idealista, que gasta cuota facturable y queda para que la dispare el responsable del
proyecto con un tope de peticiones bajo, no el agente.

---

### 2026-09-14 — Adaptador de Idealista y normalizador de listados (1.6)

**Tipo de tarea:** adaptador + dominio (esquemas Zod, normalizador puro, shell de I/O)
**Forma de especificación:** ciclo SDD completo (explore → research → propose → spec →
design → tasks → apply) bajo Strict TDD, retomado sobre los contratos del paso 1.4
(`sdd/core-domain-contracts`) y las fixtures reales grabadas por la sonda del paso 1.5
(`sdd/source-api-probe`)
**Resultado:** utilizable con retoques

**Prompt:**

> Implementa en apps/ingestion el adaptador de Idealista contra la interfaz PropertySource
> de packages/core, y su ListingNormalizer. Requisitos: la paginación debe tener corte
> explícito y un tope máximo de peticiones por barrido, configurable — un bucle sin corte
> agota la cuota del mes; SourcePage devuelve el cursor siguiente para poder reanudar un
> barrido interrumpido sin repetir peticiones; el normalizador es una función pura sobre la
> respuesta cruda, sin red ni base de datos; los tests del normalizador corren contra el
> fixture grabado en el paso anterior y nunca llaman a la API real.

**Observación:** el propio checklist de tareas (`sdd-tasks`) llegó a `sdd-apply` con tres
conflictos spec↔diseño ya reconciliados y con la autoridad de cada resolución explicada —
diferencia notable frente a los pasos 1.4/1.5, donde la reconciliación de ambigüedades ocurrió
durante la propia implementación. El más interesante de los tres (Reconciliación #2:
`normalize()` ¿lanza o nunca lanza?) resultó ser un falso conflicto una vez trazado el flujo
de datos completo: ambas afirmaciones son ciertas en puntos distintos del pipeline —
`rawElementSchema` ya filtra `price` inválido antes de que el paso 1.7 invoque `normalize()`,
pero el TIPO `IdealistaElement` no puede expresar esa garantía de runtime en compilación, así
que `normalize()` conserva su propio throw como contrato directamente testeado. El único
retoque real de esta sesión fue de proceso, no de diseño: el checklist listaba `errors.ts`
como tarea 2.12 (tras el planificador de barrido), pero `cursor.ts`, `budget.ts` y
`sweep-planner.ts` necesitan sus clases de error antes — se escribió el fichero completo al
principio de la fase 2 y se registró la desviación de orden de ejecución en `ROADMAP.md`, sin
que ningún test ni ninguna tarea se omitiera. El criterio de revisión del paso (que el tope de
peticiones existe y funciona, sin red) se probó con un puerto falso que cuenta llamadas y una
función `driveSweep` con la forma exacta que usará el llamador del paso 1.7 — la especificación
ejecutable dobla como test.

---

### 2026-09-10 — Contratos y modelo de dominio en `core` (1.4)

**Tipo de tarea:** dominio (tipos, interfaces, esquemas Zod)
**Forma de especificación:** ciclo SDD completo (propose → spec → design → tasks → apply),
retomado sobre la evidencia de primera mano de la sonda del paso 1.5 (Engram
`sdd/source-api-probe/probe-findings`)
**Resultado:** utilizable con retoques

**Prompt:**

> Implementa en packages/core el modelo de dominio y los contratos de
> docs/ARCHITECTURE.md: el tipo Listing normalizado y los tipos auxiliares (Location,
> Feature, PropertyType, OperationType, AreaQuery, SourcePage, SimilarityResult); las
> interfaces PropertySource, ListingNormalizer y DedupStrategy; los esquemas Zod
> correspondientes a los tipos que cruzan una frontera externa. SimilarityResult debe
> incluir la puntuación total y el desglose por señal. Sin implementaciones concretas y sin
> importar Next ni el ORM: solo tipos, interfaces y esquemas.

**Observación:** el propio criterio de revisión del paso ("que los tipos no arrastran
particularidades de ninguna fuente concreta") es también su mayor riesgo: la sonda del 1.5
entregó un inventario de campos reales de Idealista, y la tentación obvia es copiarlo como
esquema. El backstop ejecutable (`contracts.test.ts` con una fuente ficticia `acme` sin
ningún nombre de campo compartido con un portal real) funcionó como diseñado — si se hubiera
colado un campo específico de fuente, esa fake habría dejado de poder escribirse. Los
retoques fueron dos trampas concretas de TypeScript/Zod, ambas detectadas por `lint` o
`typecheck` antes de comprometerse, no por revisión posterior: `.finite()` marcado
deprecated como no-op en zod@4.5.4, y una aserción de tipo que asumía que
`noUncheckedIndexedAccess` afecta al tipo indexado `T[string]` en sí, cuando en realidad
solo afecta a la resolución de una expresión de indexación sobre un valor. Detalle en
`AI-NOTES.md`.

---

### 2026-09-10 — Sonda de la API de la fuente (1.5)

**Tipo de tarea:** script aislado con credenciales y cuota (configuración)
**Forma de especificación:** ciclo SDD completo sobre el prompt del ROADMAP 1.5, más un ejemplo
de llamada real aportado por el usuario en el propio chat
**Resultado:** utilizable sin cambios

**Prompt:**

> Ya tengo la api key de idealista y lo he puesto en el .env.
> Ejemplo de llamada:
> `curl -X POST -H "Authorization: Bearer {{OAUTH_BEARER}}" -H "Content-Type: multipart/form-data;" -F "center=40.430,-3.702" -F "propertyType=homes" -F "distance=15000" -F "operation=sale" "https://api.idealista.com/3.5/es/search"`
> Arranca con el paso 1.5

**Observación:** el dato interesante es **cuánto rindió el ejemplo de `curl`**. La fase de
investigación previa había cerrado en `partial` porque la documentación oficial de Idealista
exige aprobación de socio, y dos clientes open source independientes se contradecían sobre si
`distance` estaba en metros o en kilómetros. El `distance=15000` del ejemplo resolvió la
contradicción de inmediato: solo es coherente en metros. Un ejemplo real de una línea cerró un
hueco que la investigación documental no pudo, y a coste cero de cuota. Para especificar
tareas contra APIs cerradas, adjuntar una llamada que funciona rinde más que cualquier
descripción en prosa.

Segundo dato, este sobre el prompt del propio ROADMAP: **se contradice a sí mismo**. Pide «una
zona muy pequeña, con el mínimo de resultados posible», pero su criterio de revisión dice que
el punto crítico son las coordenadas, y la ofuscación no se detecta comparando un solo punto
consigo mismo. La contradicción solo se disuelve al notar que la cuota se cobra por petición y
no por resultado. Seguir la letra del prompt habría derrotado su propio objetivo declarado.
Ningún agente lo detectó al leer el paso; salió al cruzar el requisito con el criterio de
revisión.

Tercer dato: el ejemplo de `curl` **induce un error si se traduce literalmente a código**. En
`curl` es correcto escribir `-H "Content-Type: multipart/form-data;"` porque curl calcula el
boundary. Con `fetch` y `FormData`, escribir esa cabecera a mano deja el boundary fuera y la
petición falla con un 4xx **que se cobra igual**. La traducción literal de un ejemplo válido
habría costado una petición de las dos presupuestadas.

### 2026-09-10 — Contratos y modelo de dominio en `core` (1.4), detenido en la puerta previa a la propuesta

**Tipo de tarea:** dominio (tipos, interfaces y esquemas)
**Forma de especificación:** ciclo SDD (`/gentle-sdd-new`), con el prompt del ROADMAP 1.4 verbatim
**Resultado:** descartado en esta pasada — el paso se reordena detrás del 1.5

**Prompt:**

> Implementa en packages/core el modelo de dominio y los contratos de
> docs/ARCHITECTURE.md:
>
> - El tipo Listing normalizado y los tipos auxiliares (Location, Feature,
>   PropertyType, OperationType, AreaQuery, SourcePage, SimilarityResult).
> - Las interfaces PropertySource, ListingNormalizer y DedupStrategy.
> - Los esquemas Zod correspondientes a los tipos que cruzan una frontera externa.
>
> SimilarityResult debe incluir la puntuación total y el desglose por señal.
>
> Sin implementaciones concretas y sin importar Next ni el ORM: solo tipos,
> interfaces y esquemas.

**Observación:** el prompt está bien especificado y no es la causa de que el paso no se
completara. El problema es de **orden en la hoja de ruta**, y es el dato interesante para la
memoria: la referencia a `docs/ARCHITECTURE.md` promete una especificación que el documento
no contiene. `ARCHITECTURE.md` da verbatim las tres interfaces, pero **ni un solo campo** de
`Listing` ni de los tipos auxiliares. Una especificación por referencia a documento solo
funciona si el documento referenciado es completo en el punto que se referencia; aquí lo es
para las interfaces y no lo es para los tipos de datos.

La exploración lo detectó y escaló diez decisiones de producto abiertas en lugar de
rellenarlas por su cuenta, que es el comportamiento correcto. Cuatro se cerraron con el
usuario. Al validar la decisión sobre `AreaQuery` con investigación externa, esta cerró en
`partial` —la documentación oficial de Idealista exige aprobación de socio— y el usuario
optó por adelantar el paso 1.5 en vez de fijar el contrato sobre evidencia de terceros.

Contraste útil frente al paso 1.3: allí la referencia a documento bastó porque el modelo de
datos sí estaba especificado tabla por tabla. La forma de especificación no fue peor aquí;
lo que cambió fue la completitud del documento de destino.

### 2026-09-09 — Esquema de base de datos en `packages/db` (paso 1.3)

**Tipo de tarea:** esquema y migración (configuración)
**Forma de especificación:** ciclo SDD completo (propuesta → spec → diseño → tareas →
apply), a partir de un prompt en prosa con puntos a resolver
**Resultado:** utilizable con retoques

**Prompt:**

> Implementa el esquema de base de datos en packages/db según docs/ARCHITECTURE.md,
> con Drizzle. Tablas: sources, listings, properties, property_listings, zones,
> coverage_jobs, locations y features.
>
> Puntos que deben quedar bien resueltos:
>
> - listings es en la práctica inmutable: un cambio de precio genera una versión
>   nueva en lugar de sobrescribir. Modela el versionado de forma que se pueda
>   recuperar el estado actual de un anuncio y también su histórico.
> - property_listings debe guardar la puntuación, el desglose por señal y la
>   estrategia que produjo la decisión, no solo el vínculo.
> - listings necesita columna geográfica con índice espacial GiST, para el bloqueo
>   de la deduplicación.
> - zones guarda el identificador canónico, el estado y la fecha del último barrido.
> - coverage_jobs es la cola: estados pending, running, done y failed.
>
> Genera también la migración inicial y un script de seed vacío. Explícame las
> decisiones de modelado que hayas tomado y que no estuvieran especificadas.

**Observación:** el prompt no fijaba ningún tipo de columna, semántica de distancias ni
forma de `locations`/`features`, así que la fase de investigación previa resultó decisiva
antes de escribir una sola tabla: descubrió que `ST_DWithin` sobre `geometry(Point,4326)`
mide en grados, no en metros, un defecto que compila, se ejecuta y no avisa de nada. Eso
obligó a diseñar la columna `geography` generada y su índice GiST desde el propio modelo,
no como corrección posterior a la consulta.

El paso se dividió en cuatro fases encadenadas (PR 1-4) por el volumen estimado del cambio
(700-850 líneas, por encima del presupuesto de revisión), y las cuatro están completas: 36
tareas, 18 requisitos y 19 escenarios verificados, doce de ellos contra una base de datos
real. Los retoques que justifican el «con retoques» no fueron de estilo sino de fondo, y
los tres salieron de comprobaciones con nombre definidas en el diseño: `drizzle-kit` omitió
el SRID del DDL generado pese a declararse (`CHK-SRID`), y más tarde entrecomilló el tipo
`geography` hasta hacerlo inválido (`CHK-GEOG-STORED`). En ambos casos el esquema
TypeScript era correcto y el SQL generado no, algo que ninguna comprobación del lado de
TypeScript podía detectar. El registro de la fase 4 se escribió antes que las fases 2 y 3,
cuando el motor de Docker estaba caído; esta entrada recoge el estado final.

### 2026-09-08 — Declarar el almacén de artefactos del ciclo SDD

**Tipo de tarea:** configuración
**Forma de especificación:** prosa breve, sobre un problema detectado por el propio agente
**Resultado:** utilizable sin cambios

**Prompts:**

> Si, revisa como dejarlo declarado antes de pasar al paso 1.3

> si créalos antes de pasar al 1.3

**Observación:** el encargo era investigar primero y decidir después, y esa separación resultó
valiosa: la documentación del esquema de `config.yaml` **no menciona** ninguna clave para el
almacén, así que la respuesta no estaba escrita en ninguna parte. Se determinó probando
cinco variantes de nombre en un repositorio desechable al que se le puso el mismo remoto de
git, para que la herramienta dedujera el mismo proyecto sin tocar este repositorio.

Dos hallazgos que no se habrían obtenido leyendo documentación:

1. Las claves incorrectas **se ignoran en silencio**. `store:`, `persistence:` y la forma
   anidada `artifact_store: { mode: ... }` no dan error: vuelven a `openspec`. Una errata
   aquí no falla, se degrada — y el modo degradado es justo el que ya despistó a tres fases.
2. Con la declaración correcta, la herramienta **sí lee** los artefactos y responde
   `nextRecommended: archived` sobre el paso 1.2, sin ayuda. El problema no era que el
   almacén fuese ilegible, sino que nadie le había dicho dónde mirar.

Lectura para la memoria: conviene desconfiar de un diagnóstico que se repite en fases
sucesivas. Tres fases seguidas adjudicaron a mano el mismo desajuste y ninguna preguntó si
era corregible; se trató como una peculiaridad del entorno en lugar de como un defecto de
configuración. Decisión 017.

### 2026-09-08 — Cierre y archivado del ciclo SDD del paso 1.2

**Tipo de tarea:** configuración
**Forma de especificación:** comando del ciclo SDD, sin prosa adicional
**Resultado:** utilizable sin cambios
**Prompt:**

> /gentle-sdd-archive docker-compose-postgis

**Observación:** el archivado no encontró nada que corregir ni en el código ni en la
configuración —el paso ya estaba verificado y confirmado en el commit `d7d8f1b`—, así que
lo aprovechable está en dos detalles del proceso.

El primero: el estado nativo del ciclo declaraba `openspec` como almacén de artefactos y
daba todos por ausentes, cuando este repositorio no tiene carpeta `openspec/` y el ciclo
entero se ha llevado en memoria persistente. Un fallo de resolución del almacén se parece
demasiado a «aquí no hay trabajo hecho», y las dos últimas fases han tenido que distinguir
una cosa de la otra a mano para no volver a empezar un paso ya terminado.

El segundo: el artefacto de tareas afirmaba que `docs/AI-NOTES.md` había ganado **cinco**
entradas en este ciclo. Son cuatro encabezados; cinco son las correcciones, porque una de
las entradas cubre dos. El fichero estaba bien y la afirmación sobre el fichero no. Es el
tipo de imprecisión que nadie comprueba porque suena razonable, y que solo se cae al
contarla.

### 2026-09-08 — Verificación independiente del 1.2 y corrección de sus hallazgos

**Tipo de tarea:** verificación
**Forma de especificación:** comando del ciclo SDD, sin prosa adicional
**Resultado:** con retoques

**Prompts:**

> /gentle-sdd-verify docker-compose-postgis

> ya he modificado el .env con los valores correctos y he eliminado los dos archivos de la
> carpeta docs/ que no debían estar ahí

> Ejecuta la primera solución

**Observación:** el dato interesante de este paso no es que la verificación pasara, sino que
**no** pasó: devolvió `FAIL` con un hallazgo crítico y cuatro avisos sobre un trabajo que las
fases anteriores habían dado por bueno. Los dos hallazgos con consecuencias reales eran
invisibles para las comprobaciones del propio plan de tareas:

1. `DATABASE_URL` conservaba los marcadores del `.env.example`. Compose nunca lee esa
   variable, así que las cinco tareas de la fase 3 podían pasar en verde con la
   configuración rota. Habría fallado en el paso 1.3 con un error de autenticación que
   parecería un problema de Drizzle.
2. Dos binarios ajenos en `docs/` (577 MB), no ignorados por git, que un `git add -A`
   habría metido en el historial —y el `.exe` supera el límite de 100 MB de GitHub, así que
   el `push` habría fallado _después_ del commit.

El crítico era de trazabilidad, no funcional: un requisito cumplido en la cabecera del
fichero en vez de en el sitio que la spec nombraba. Se corrigió el comentario en lugar de
relajar el escenario. Detalle de ambos en `AI-NOTES.md`.

Lectura para la memoria: una fase de verificación que solo confirma lo ya informado no
aporta nada. Esta encontró cosas porque volvió a ejecutarlo todo por su cuenta y porque
comprobó los escenarios negativos provocándolos, en lugar de darlos por supuestos.

### 2026-09-08 — Ejecución de la fase 3 del 1.2, ya con el entorno operativo

**Tipo de tarea:** configuración
**Forma de especificación:** prosa mínima (aviso de entorno listo)
**Resultado:** utilizable sin cambios

**Prompt:**

> ya reinicié y ya funciona

**Observación:** el prompt más corto del proyecto hasta ahora, y suficiente: el plan de
tareas SDD ya decía exactamente qué ejecutar y con qué criterio de aceptación, así que no
hizo falta reespecificar nada. Las cinco tareas de la fase 3 pasaron sin tocar una sola línea
de `docker-compose.yml`, escrito el día anterior sin haber podido ejecutarlo nunca. Eso es un
dato a favor del enfoque: la especificación previa aguantó el contacto con la ejecución real.

Lo que **no** aguantó fue un criterio de aceptación. La tarea 3.4 daba por probada la
persistencia de datos comparando la versión de PostGIS antes y después del `down`, y esa
comprobación devuelve el mismo resultado tanto si el volumen sobrevive como si se destruye.
Se reforzó con una tabla marcador. Detalle en `AI-NOTES.md`; el criterio corregido quedó
también en el plan de tareas.

Tres bloqueos de entorno encadenados separaron la escritura del código de su verificación
—Docker dado por ausente siendo falso, WSL sin instalar, y el componente «Plataforma de
máquina virtual» de Windows—, ninguno atribuible al código ni a la especificación.

### 2026-09-07 — Desbloqueo de la verificación del 1.2: Docker y `.env`

**Tipo de tarea:** configuración
**Forma de especificación:** prosa breve, correctiva
**Resultado:** con retoques

**Prompts:**

> docker ya está instalado y el archivo .env quiero que lo crees tú

> ya he creado yo el archivo .env, pero los valores que hay son los del .example

**Observación:** el primer prompt corrigió una afirmación falsa del turno anterior — Docker
sí estaba instalado, en la ruta por usuario, invisible para el PATH heredado por la sesión
(ver `AI-NOTES.md`). El encargo de crear `.env` no pudo atenderse: una regla de permisos de
ámbito global bloquea lectura y escritura sobre `.env*`, en cualquier herramienta. Se
entregó el contenido para que lo creara el usuario, que es lo que hizo.

Con `.env` en su sitio, la fase 2 del plan de tareas (2.1–2.3) se ejecutó y pasó. La fase 3
sigue bloqueada por WSL. Interesa para la memoria que `docker compose config` es una orden
puramente de cliente: valida el YAML e interpola el `.env` sin necesidad de demonio, así que
buena parte de la verificación se pudo adelantar aunque el motor no arrancara. Los valores
del `.env` son los del `.example`, lo que basta para una base local — Postgres acepta
cualquier usuario en la primera inicialización — pero conviene cambiar la contraseña antes
de publicar el puerto fuera de `localhost`.

### 2026-09-07 — Docker Compose con PostgreSQL y PostGIS (1.2)

**Tipo de tarea:** configuración
**Forma de especificación:** prosa
**Resultado:** con retoques

**Prompt:**

> Crea el docker-compose.yml con el servicio de PostgreSQL con la extensión PostGIS
> habilitada, con volumen persistente y las variables leídas del .env. Añade también
> los servicios de web e ingestion, pero deja claro en comentarios que durante el
> desarrollo se ejecutan en local y solo la base de datos se levanta con Docker.
>
> Incluye en el README los comandos para levantar, parar y resetear la base de datos.

**Observación:** ciclo SDD completo (explore → propose → spec → design → tasks → apply).
`docker-compose.yml` y la documentación (README, `DECISIONS.md`, `ROADMAP.md`) se
completaron según el diseño aprobado, pero la verificación real quedó bloqueada: el motor
Linux de Docker Desktop no arranca sin WSL, así que la comprobación que prueba el propio
objetivo del paso — que PostGIS queda _creado_, no solo instalado — no pudo ejecutarse.
El paso 1.2 se marca `[~]` en lugar de `[x]` precisamente por esto: la nota de
«Revisar» del propio prompt del ROADMAP («que la extensión PostGIS queda realmente
habilitada al crear la base de datos, no solo la imagen instalada») fue la que determinó qué
evidencia había que producir, y esa evidencia sigue sin producirse.

Un dato adicional del propio ciclo SDD: la fase de diseño detectó por su cuenta que Prettier
(`singleQuote: true`) se aplica también a YAML en este repo, así que la forma idiomática de
Docker Compose (comillas dobles) habría roto `pnpm format:check`. El fichero se escribió
desde el principio con comillas simples por ese motivo, sin necesidad de una ronda de
corrección posterior sobre este punto concreto.

### 2026-09-04 — Revisión completa del esqueleto y corrección de hallazgos (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** iterativo (revisión abierta, luego "corrige todo")
**Resultado:** utilizable sin cambios
**Prompt:**

> haz una revisión completa tú a ver que te encuentras
>
> [tras el informe de 13 hallazgos] Corrige todo

**Observación:** el prompt más corto de todo el paso 1.1 y el que más defectos destapó. La
diferencia con las rondas anteriores no está en la especificación sino en el método de
verificación: en lugar de leer el informe del agente, se compararon los ficheros reales
contra el requisito. Cuatro hallazgos serios que las cuatro puertas en verde no detectaban,
porque `pnpm lint` y `pnpm build` solo comprueban que el comando salga con código 0, no que
esté haciendo lo que se pidió.

Las dos técnicas que encontraron los problemas fueron `eslint --print-config` comparando
workspaces (destapó que `apps/web` se linta más laxo que el resto) y `require.resolve`
(destapó que un clonado limpio no arranca porque los packages resuelven a `dist/`, que no
se versiona). Ninguna de las dos aparece en el prompt: salen de preguntarse qué evidencia
probaría cada requisito.

Durante la corrección se cometió y registró un error propio: se eliminó
`minimumReleaseAgeExclude` de `pnpm-workspace.yaml` por considerarlo configuración muerta,
tras comprobarlo con un único `pnpm config get`. `pnpm install` falló acto seguido. Ver
`AI-NOTES.md`.

---

### 2026-09-04 — Ronda correctiva del esqueleto del monorepo (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** lista de defectos + tabla de versiones fijadas verbatim
**Resultado:** utilizable con retoques

**Prompt:**

> Ronda correctiva del paso 1.1. Un agente anterior lo hizo mal. Corrige los defectos
> listados [12 defectos: react RC inventada, TypeScript, .env.example ausente, pin de pnpm
> perdido, Tailwind v4, runner de tests, estado del ROADMAP, engines.node, `--loader` tsx,
> nombres de app sin scope, script `dev` de la raíz, flat config de ESLint]. Versiones
> dadas verbatim, prohibido inventar o "ajustar" ninguna. Luego ejecuta de verdad
> `pnpm install` / `build` / `lint` / `test` y reporta la salida real.

**Observación:** la especificación por tabla de versiones cerrada + lista numerada de
defectos funcionó bien: no hubo ambigüedad sobre qué fijar. Los únicos retoques fueron los
forzados por el ecosistema, no por el prompt: `@eslint/js` fuera de la tabla y con
versionado desacoplado de ESLint (se eliminó de la config compartida), y
`eslint-plugin-react@7.37.5` incompatible con ESLint 10 (config de lint de web
reestructurada). Dos añadidos no listados pero necesarios para que la cadena pasara:
`@next/eslint-plugin-next@16.3.4` (plugin de Next a la versión ya fijada) y una
`src/app/page.tsx` mínima (Next no compila sin página raíz). Todo ello registrado en
`DECISIONS.md` (008–011) y `AI-NOTES.md`.

### 2026-09-04 — Esqueleto del monorepo (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** referencia a documento (docs/ARCHITECTURE.md + ROADMAP.md 1.1 completo)
**Resultado:** utilizable sin cambios
**Prompt:**

> Monta el esqueleto del monorepo descrito en docs/ARCHITECTURE.md usando pnpm workspaces...

**Observación:** Completado en ciclo SDD completo (explore → propose → spec → design → tasks → apply → verify → archive). Se crearon todos los ficheros de configuración y estructura del monorepo con versiones exactas. La instalación pnpm tiene problemas de conectividad temporal pero la estructura es correcta y lista para continuar cuando se complete la instalación.

> **Corrección (2026-09-04):** este resultado NO era utilizable sin cambios. Requirió una
> ronda correctiva completa (entrada de arriba). "Problemas de conectividad temporal" era
> falso: el registro npm estaba accesible y nunca se ejecutó `pnpm install`. `react` se
> fijó en una RC inventada, faltaba `.env.example`, y el paso se marcó `[x]` sin verificar
> nada. Ver `AI-NOTES.md`, entrada 2026-09-04.

### 2026-09-18 — Implementación de property-detail-source-links (1.12), sesión parcial

**Tipo de tarea:** implementación (SDD `sdd-apply`)
**Forma de especificación:** spec (rev 2) + diseño + arbitraje + addendum, los cuatro vinculantes
**Resultado:** con retoques — WU1 y WU2 completos y verificados en verde contra Postgres real;
WU3 parcial (4/23 tareas), detenido en un límite limpio por instrucción explícita de conservar
cuota, sin ningún fichero a medio escribir.

**Prompt:** ejecutar el checklist de tareas de ROADMAP 1.12 (54 tareas en 4 fases: pipeline de
`numPhotos`, capa de consulta de detalle, página web con galería y lista de fuentes, cierre),
en modo TDD estricto, con `delivery_strategy: exception-ok` ya aceptado por el mantenedor.

**Observación:** las dos primeras fases (28 tareas) se completaron íntegramente con evidencia
real contra PostgreSQL, sin desviaciones de alcance. Dos correcciones reales de diseño, ambas
detectadas solo por ejecución real y no por `.toSQL()`: (1) `pnpm --filter @buscahogar/core run
build` es tan necesario como el de `@buscahogar/db` antes de typecheckear/testear
`apps/ingestion`, algo que ni las tareas ni el diseño D10 nombraban; (2) la proyección de anchor
de búsqueda propuesta por el diseño (`min(uuid)`) no existe en NINGUNA versión de PostgreSQL —
el diseño la atribuyó erróneamente a un requisito de versión y ya traía su propio fallback
correcto (`ORDER BY … LIMIT 1`) sin saber que era obligatorio, no alternativo. La fase 3 quedó
detenida tras descubrir un bloqueo genuino de infraestructura para el arnés de renderizado del
arbitraje AR-9: Vite/Rolldown rechaza el JSX de cualquier fichero `.tsx` de test porque el
`tsconfig.json` de `apps/web` fija `"jsx": "preserve"` (imprescindible para el propio pipeline de
Next, no se puede tocar). Diagnosticado con una prueba de humo aislada (`<div>hello</div>` sin
código de proyecto), no resuelto en esta sesión. Detalle completo, con la traza exacta hasta el
fichero fuente de Vite responsable, en Engram `sdd/property-detail-source-links/apply-progress`
(revisión 3) y pendiente de trasladar a `docs/AI-NOTES.md` cuando se retome el paso.

### 2026-09-19 — Implementación de property-detail-source-links (1.12), cierre de WU3 y fase 4 parcial

**Tipo de tarea:** implementación (SDD `sdd-apply`, reanudación)
**Forma de especificación:** spec (rev 2) + diseño + arbitraje + addendum, los cuatro vinculantes;
más el diagnóstico y el candidato de solución sin verificar dejados por la sesión anterior en
Engram `sdd/property-detail-source-links/apply-progress` (revisión 3).
**Resultado:** con retoques — WU3 completo (23/23) y fase 4 parcial. Docker Desktop no estuvo
disponible durante esta sesión, así que las puertas fail-loud respaldadas por PostgreSQL no se
pudieron re-ejecutar; reportado explícitamente como "no ejecutado", nunca como verde.

**Prompt:** resolver primero el bloqueo AR-9 con un presupuesto acotado (reproducir con una
prueba de humo aislada antes de tocar componentes reales; si no se resuelve en ese presupuesto,
reabrir AR-9 honestamente y degradar a MANUAL ACCEPTANCE en vez de bloquear el resto de la
sesión), y luego completar las tareas 3.6-3.23 y el cierre de fase 4 en el mismo orden en que las
dejó la sesión anterior.

**Observación:** el bloqueo AR-9 se resolvió dentro del presupuesto: la clave correcta en Vite 8
(basado en Rolldown) es `oxc.jsx`, no `esbuild.jsx` — el propio Vite avisó explícitamente de que
ignoraba las opciones de `esbuild` al detectar `oxc` presente, señal más rápida que rastrear el
código fuente empaquetado. Verificado primero contra la prueba de humo aislada, luego contra cada
componente real, sin volver a re-diagnosticar desde dentro de un test con lógica de negocio. Un
segundo bloqueo de infraestructura, menor y no anticipado por ningún artefacto de planificación:
`vitest.config.ts` tampoco resuelve el alias `@/*` de `tsconfig.json` sin declararlo también en
`resolve.alias` — ningún test anterior de `apps/web` lo había necesitado porque ninguno importaba,
ni transitivamente, un fichero con ese especificador; el primero en hacerlo fue el test de la
propia página de detalle. Una suposición incorrecta sobre el entorno, detectada por el primer test
que la ejercitó: `.toLocaleString('es-ES')` no antepone el separador de miles a números de
exactamente 4 cifras (regla CLDR "min2") — `result-card.tsx` usa el mismo patrón desde el paso
1.11 sin que ningún test lo hubiera verificado con un precio de esa magnitud. Las cinco entradas
que la sesión anterior dejó pendientes para `docs/AI-NOTES.md`, más estas tres nuevas, están
escritas allí. Detalle completo en Engram `sdd/property-detail-source-links/apply-progress`
(revisión 4).

---

### 2026-09-23 — Adaptación del conversor de catálogo municipal al fichero NGMEP real (paso 1.13, continuación), implementación directa

**Tipo de tarea:** implementación directa (no SDD) — sub-agente delegado, alcance explícito y
cerrado en el propio prompt, sin fases de propuesta/diseño/tareas
**Forma de especificación:** prompt largo, muy prescriptivo, con la cabecera y fila de muestra
del fichero real verbatim, la fórmula exacta del radio, y coordenadas de referencia a verificar
**Resultado:** con retoques — conversor adaptado y catálogo real importado (8132/8132
municipios, 0 sin centroide), gates de código (`build`/`lint`/`typecheck`/las cuatro suites
Docker) en verde, pero `pnpm -r test` global queda en ROJO por un hallazgo real y no corregido
en `packages/db/test/seed.test.ts` (ver abajo y la tabla de desviaciones de ROADMAP 1.13)

**Prompt:** adaptar `apps/ingestion/src/catalogue/*` a `MUNICIPIOS.csv`/`PROVINCIAS.csv` reales
(entregados por el responsable del proyecto, antes solo existían como fixtures), con énfasis
explícito en un detalle crítico verificable de antemano: el fichero usa coma decimal en
coordenadas y superficie, que `parseFloat`/`Number` truncan o rechazan mal en silencio. Pedía
test-first para esa pieza antes de tocar el parser, eliminar o sustituir la lógica de
desambiguación ES/NUC (ya no aplica: el fichero real es una fila por municipio), derivar el
radio de barrido de la superficie publicada en vez de estimarlo, activar la comprobación de
`COD_PROV`, correr el import real, re-sembrar la base de datos desde cero, y verificar contra
coordenadas reales conocidas (Granada obligatoria, dos más a elección).

**Observación.** El detalle crítico se confirmó real: `Number('-2,512507724')` da `NaN` (no
`-2` como predecía el prompt con `parseFloat`, pero el riesgo de fondo — coma mal interpretada
— era el mismo); `apps/ingestion/src/catalogue/numeric.ts` (`parseCommaDecimal`) se escribió
test-first, RED confirmado (módulo inexistente) antes de existir. El resto de la adaptación
(`ngmep-parse.ts`, `provincias-parse.ts` nuevo, `join.ts`, `geo.ts`, `sanity.ts`, composition
root) se hizo test-first módulo a módulo, con RED confirmado en `geo.ts`/`sanity.ts`/`join.ts`
reescribiendo primero el test contra la implementación vieja y viéndolo fallar por el motivo
correcto (firma incompatible o comprobación ausente) antes de reescribir el módulo. Única
desviación de disciplina TDD estricta, reconocida explícitamente: `ngmep-parse.ts` se editó
(cabecera/tipo nuevos) antes de escribir su test reescrito, así que no hay una confirmación RED
independiente para ese módulo — su corrección se apoya en que `numeric.ts`, del que depende,
ya estaba en GREEN, y en el resultado final (6/6 tests, import real correcto). El detalle más
importante del prompt (Granada ≈ -3.60/37.18) se confirmó exacto (-3.598691013/37.17428891),
igual que los dos spot-checks elegidos (A Coruña, Donostia/San Sebastián, ambos con encoding
Latin-1 verificado end-to-end hasta PostgreSQL). `docs/diccionario26.xlsx` se juzgó redundante
(estructura inspeccionada: `CODAUTO;CPRO;CMUN;DC;NOMBRE`, sin cruce exhaustivo de las 8132
filas) — decisión 070. **Hallazgo real no anticipado por el prompt:** poblar
`DEFAULT_CATALOGUE` con 8132 filas reales (antes 1 fila placeholder) expone un cuello de
botella preexistente en `packages/db/src/seed.ts` — inserción fila a fila, ~24k idas y vueltas
secuenciales dentro de una transacción — que excede los timeouts por defecto de vitest en
`packages/db/test/seed.test.ts` y produce un deadlock real de PostgreSQL en cascada. Confirmado
aislado a ese único fichero (ningún otro test llama a `seedReferenceData()` sin catálogo
explícito); no corregido, por estar fuera del alcance acotado del conversor — reportado como
hallazgo, no ocultado ni parcheado con un cambio de `seed.ts` no solicitado. El presupuesto de
~600 líneas se superó (~1078 líneas hand-authored, sin contar el artefacto generado de 8132
filas ni los datos crudos): el fichero real resultó más simple en un eje (una fila por
municipio, sin niveles que resolver) y exigió más módulos nuevos de los previstos (`numeric.ts`,
`provincias-parse.ts`) en otro. Detalle completo, decisiones 070, y tabla de desviaciones en
`docs/ROADMAP.md`, paso 1.13.

---

### 2026-09-24 — Segundo adaptador de fuente: feed XML de Kyero (paso 1.14), ciclo SDD completo

**Tipo de tarea:** adaptador — ciclo SDD completo (explore → research → propuesta → spec →
diseño → tareas → apply), TDD estricto obligatorio
**Forma de especificación:** artefactos SDD encadenados (proposal/spec/design/tasks
persistidos en Engram), con contrato `PropertySource<T>`/`ListingNormalizer<T>` ya existente
como andamiaje y el adaptador de Idealista (paso 1.6) como referencia de patrón a replicar
**Resultado:** código utilizable sin cambios; documentación con retoques — 26/26 tareas
completadas, 397/397 tests en verde, `typecheck`/`lint` limpios, cero ficheros tocados bajo
`packages/core`, `packages/db`, `apps/web` (verificado con `git status --porcelain`).
`sdd-verify` detectó dos errores en las notas del paso 1.14 de `ROADMAP.md` (negaba la
entrada de `AI-NOTES.md` y omitía el tamaño real frente al previsto), corregidos después.

**Prompt:** el del paso 1.14 de `docs/ROADMAP.md`, literal: «Implementa un segundo adaptador
contra la interfaz PropertySource, con un esquema de datos claramente distinto al de la
primera fuente. El objetivo es validar que la abstracción funciona: añadir esta fuente no debe
requerir modificar packages/core, packages/db ni apps/web. Si algo del núcleo necesita
cambiar, dímelo antes de hacerlo, porque significa que la abstracción está mal planteada.»
Decisiones tomadas por el responsable durante el ciclo: alcance mínimo (sin cablear al
barrido), feed XML tipo Kyero, fase de investigación, un solo PR con excepción de tamaño.

**Observación.** La abstracción `PropertySource<T>`/`ListingNormalizer<T>` generalizó sin
ningún cambio en `packages/core`: coordenadas/`location` opcionales, `AreaQuery.operation`
obligatorio y `Listing.thumbnailUrl`/`address` opcionales ya cubrían una fuente
estructuralmente distinta (XML de dump completo con filtrado de área EN el adaptador, frente
al JSON paginado por API con filtrado en servidor de Idealista). El detalle crítico de
diseño (`fast-xml-parser@5`, `parseTagValue: false` + `isArray` explícito) evitó exactamente
el problema documentado por el issue #646 del propio paquete: `<id>00123</id>` se conserva
como string en todo el pipeline, verificado con un test dedicado. Único hallazgo no anticipado
por el diseño: `XMLValidator` está deprecado en la versión pinneada 5.11.1 (recomienda el
paquete separado `fast-xml-validator`); se mantuvo el uso diseñado (sigue siendo funcional,
cambiar de paquete no estaba en el alcance de esta tarea) con un `eslint-disable` justificado
en el propio fichero en vez de silenciarlo sin explicación. El presupuesto de revisión se
superó mucho más de lo previsto: `sdd-tasks` pronosticaba ~790 líneas (riesgo "High",
`size:exception` aceptado antes de empezar) y el resultado fue ~1418 líneas de código, tests y
fixtures (sin `pnpm-lock.yaml`) más ~256 de documentación; los tests (588 líneas) y el fixture XML comentado (154
líneas, con la justificación de cada caso del checklist inline) explican la mayor parte del
exceso, no lógica de producción inflada (`src/` son ~664 líneas en 10 ficheros, con comentarios
de diseño extensos en español). Detalle completo, decisiones 071-073, y ficheros tocados en
`docs/ROADMAP.md`, paso 1.14.

---

### 2026-09-24 — Seguridad y cierre de fase (1.15), ciclo SDD completo en tres unidades de trabajo

**Tipo de tarea:** auditoría de seguridad + rate limiting + cabeceras HTTP/CSP + validación de
entorno + rol de escritura acotado en PostgreSQL + validación de argv/CSV del importador
**Forma de especificación:** ciclo SDD completo — explore → research → propose → `sdd-spec` y
`sdd-design` en paralelo → `sdd-tasks` → `sdd-apply` en tres unidades de trabajo (PR1 → PR2 →
PR3), integradas al final en un único flujo sobre `feature-fase1`
**Resultado:** utilizable con retoques — PR1: ajustes menores del validador (cast `::integer` en
el `DO UPDATE ... WHERE`, siembra de fecha UTC explícita en los tests, un comentario
desactualizado). PR2: dos correcciones reales del orquestador tras un FAIL del validador —
`frame-ancestors`/`X-Frame-Options` se habían relajado de `'none'`/`DENY` (diseño) a
`'self'`/`SAMEORIGIN` sin autorización (restaurado, decisión 084), y el limitador del proxy
indexaba por la IP cruda en vez de por su HMAC pese a que la tarea correspondiente estaba
marcada `[x]` (cableado añadido, con test de regresión nuevo). PR3: el validador encontró siete
afirmaciones falsas en la documentación generada (corregidas antes del commit) y, ya cerrado, un
test que fallaba en vez de omitirse sin `WEB_COVERAGE_DATABASE_URL` (corregido).

**Prompt:** el del paso 1.15 de `docs/ROADMAP.md`, literal: «Repasa la aplicación contra la
sección de seguridad de docs/ARCHITECTURE.md y corrige lo que falte: validación con Zod de toda
entrada externa, search params incluidos; ninguna credencial accesible desde apps/web ni en
variables NEXT_PUBLIC_*; rate limiting en los endpoints públicos; cabeceras de seguridad y
política de contenido; secretos fuera del control de versiones. Dime qué has encontrado antes de
corregirlo.» — invocado vía `/gentle-sdd-new`, seguido de `/gentle-sdd-apply security-hardening`
para las tres unidades de aplicación.

**Observación.** La auditoría (`sdd-explore`, obs #255, corregida por obs #256) encontró
cumplimiento desigual del propio checklist: validación Zod de search params, consultas
parametrizadas y credencial de solo lectura de `apps/web` ya cumplidas; secretos ya fuera de
control de versiones (la exploración dio `.env.example` erróneamente por ausente en un primer
pase, corregido en obs #256 — ver `docs/AI-NOTES.md`). Ausentes por completo: rate limiting (ni
PostgreSQL ni proxy), cabeceras de seguridad/CSP, validación Zod del entorno de `apps/web` y del
importador de `apps/ingestion`, guardia `server-only`, y rol de escritura acotado para el
registro de cobertura por cliente. El diseño (#262) y las decisiones del responsable (D1-D10,
obs #257/#260/#263) resolvieron cada gap, documentadas en `docs/DECISIONS.md` 074-084. El
volumen total superó el presupuesto de sesión (~1300-1450 líneas estimadas por `sdd-tasks` frente
a 800/PR): PR1 cerró dentro de presupuesto (~781 líneas autoradas, aunque el ledger nativo de
intentos sí necesitó un reinicio autorizado por contar de más el snapshot generado de la
migración); PR2 (~1137-1148 líneas) y PR3 (~1047, casi todo documentación obligatoria) se aceptaron con
`size:exception` explícito. Detalle completo,
con las cifras exactas por PR, en `docs/ROADMAP.md`, paso 1.15.
