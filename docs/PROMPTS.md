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
