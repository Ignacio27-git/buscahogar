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
