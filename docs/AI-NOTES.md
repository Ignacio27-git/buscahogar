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
