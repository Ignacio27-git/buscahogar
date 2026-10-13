# Hoja de ruta del diseño de la web

Secuencia de pasos para diseñar la interfaz de `apps/web`, con el prompt de cada uno, qué revisar
antes de continuar y espacio para anotar lo ocurrido. Complementa `docs/ROADMAP.md`: la hoja de ruta
funcional está completa (fases 0-3) y la web funciona, pero se presenta como HTML semántico sin
estilos. No hay tokens, estructura común, tema oscuro, estados de carga, error o 404, filtros
estructurados en la página principal ni verificación visual.

Es un documento vivo, con las mismas reglas que `docs/ROADMAP.md`: los pasos se reordenan, se parten
o se descartan, y el motivo se anota en la propia entrada y en el registro de desviaciones del final
de este fichero. La decisión 126 explica por qué es un fichero aparte.

**Cómo usarlo.** Un paso por sesión y **un cambio SDD por paso**: el bloque `text` de cada paso es la
petición que se pega en su propio `/gentle-sdd-new`. Cada paso respeta las reglas transversales de
abajo. Revisar el resultado antes de pasar al siguiente.

**Registro.** En los pasos `D.n`, el registro obligatorio de `CLAUDE.md` actualiza este fichero (estado
y notas del paso, y su tabla de desviaciones) en lugar de `docs/ROADMAP.md`. `docs/PROMPTS.md`,
`docs/DECISIONS.md` y `docs/AI-NOTES.md` son los mismos de siempre.

**Tamaños.** S, menos de 200 líneas revisables; M, de 200 a 500; L, más de 500, y por eso ya va
partido en a/b. El presupuesto de revisión es de 800 líneas por paso (regla R9).

**Estados:** `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[-]` descartado

---

# Decisiones de partida

Confirmadas por el responsable durante la planificación (cambio SDD `web-ux-ui-design-roadmap`). El
detalle y las alternativas descartadas están en `docs/DECISIONS.md`, 126-131.

| Decisión | Elegido | Descartado | Nº |
|---|---|---|---|
| Ubicación del plan | `docs/DESIGN-ROADMAP.md`, pasos `D.n`, registro de desviaciones propio | «Fase 4» dentro de `docs/ROADMAP.md` | 126 |
| Tecnología de estilos | Tailwind v4 con `@theme` y componentes propios | biblioteca *headless*; shadcn | 127 |
| Tema oscuro | Sigue al sistema y además hay un selector | solo claro; solo el del sistema | 128 |
| Dispositivos | Móvil y escritorio por igual | primero móvil; primero escritorio | 129 |
| Verificación visual | Playwright y axe, con capturas de referencia generadas en Linux (Docker) | solo el MCP de Playwright; solo revisión manual | 130 |
| Ficha de la vivienda | Las funciones nuevas (histórico, mapa, comparación) son pasos propios | solo diseño, sin funciones nuevas | 131 |
| Alcance | Completo: D.0-D.17 | pulir solo las pantallas de la demo | — |
| Dirección visual | Se decide en D.0 con `impeccable shape` | decidirla en este plan | — |

---

# Reglas transversales

Todo paso las cumple. Un paso que necesite saltarse una la enmienda con una entrada en
`docs/DECISIONS.md` y una fila en el registro de desviaciones.

- **R1 · CSP.** La política es estática y está en `apps/web/next.config.ts`: `font-src 'self'`,
  `img-src 'self' blob: data: https://tile.openstreetmap.org`, `script-src 'self' 'unsafe-inline'` y
  `style-src 'self' 'unsafe-inline'`. Ni fuentes, ni iconos, ni CDN remotos. No hay fuente propia: se usa
  la pila tipográfica del sistema, sin `next/font` ni ficheros de fuente (decisión 132). La vigilan `apps/web/test/csp-image-policy.test.ts` y
  `apps/web/test/security-headers.test.ts` (decisiones 080 y 112).
- **R2 · Imágenes.** Solo con `next/image`: ni `<img>` nativo ni `unoptimized`. Los hosts remotos son
  los de `images.remotePatterns`, hoy solo `img4.idealista.com`. Añadir uno es una decisión de
  seguridad. Única excepción (decisión 179, D.11): `<img>` nativo en `components/property-location.tsx`,
  solo para teselas de `tile.openstreetmap.org` con `src` de `osmTileUrl`; lo fija `csp-image-policy.test.ts`.
- **R3 · Filtros en la URL.** Los filtros viven en los search params, se validan con Zod
  (`packages/core/src/schemas/search-query.schema.ts`) y se envían con formularios GET
  (`form=criteria`, decisión 123). No hay estado de filtros en el cliente ni bibliotecas de estado.
- **R4 · Allowlist de `'use client'`.** `apps/web/test/no-client-directive.test.ts` admite exactamente
  dos ficheros: `components/coverage-status.tsx` y `components/search-map.tsx`. Un componente de
  cliente nuevo exige ampliar el allowlist y una entrada en `docs/DECISIONS.md` (precedentes: 065 y
  113).
- **R5 · Sin JavaScript.** Toda página funciona sin JavaScript: el mapa tiene alternativa en
  `noscript`, la galería navega con anclas y los formularios son GET. El diseño mejora
  progresivamente; nunca exige JS para buscar, filtrar o ver una ficha.
- **R6 · Tests que fijan el marcado.** Hay tests que fijan el texto y la estructura con
  `renderToStaticMarkup`: `result-card`, `property-header`, `source-gallery`, `source-list`,
  `home-page-map`, `home-page-nl`, `property-detail-page`, `property-detail-page-static`,
  `db/page-coverage-degradation`, y las guardas `no-redirect`, `no-single-source-branch`,
  `layout-attribution`, `architecture-attribution`, `map-guards`, `csp-image-policy` y `property-location` (D.11). Cada paso presupuesta en sus notas
  qué tests cambia. Un test se actualiza conservando lo que afirma, nunca se borra para que pase.
- **R7 · Atribuciones.** El pie con la atribución CC-BY 4.0 del IGN/CNIG es obligación legal (Orden
  FOM/2807/2015) y lo fija `layout-attribution.test.ts`. La atribución «© OpenStreetMap» enlazada
  (ODbL, decisión 112) sigue visible en todo mapa. Ninguna de las dos se oculta, se reduce hasta
  hacerse ilegible ni se mueve tras una interacción.
- **R8 · Sin llamadas externas desde el servidor.** Ningún paso añade peticiones del servidor de
  `apps/web` a hosts externos. La única excepción del navegador son las teselas de OSM (decisión
  112). Los tests nunca llaman a fuentes reales.
- **R9 · Presupuesto de revisión.** 800 líneas por paso. Si la previsión de `sdd-tasks` lo supera, el
  paso se parte en a/b antes de aplicar y se anota en el registro de desviaciones.
- **R10 · Móvil y escritorio por igual.** Cada pantalla se diseña y se verifica a 320, 768 y 1280 px.
  Ningún ancho es secundario. A 320 px no hay desplazamiento horizontal de página.
- **R11 · Verificación visual acotada.** Desde D.1: una sola ronda en lote con capturas a 320, 768 y
  1280 px, en tema claro y oscuro, y un análisis axe con `wcag22aa` de las rutas tocadas. Después, un
  único lote de correcciones y, como mucho, una ronda de confirmación. Las capturas de referencia se
  actualizan a propósito y solo en Docker (Linux), y los tests de R6 se corrigen en el mismo paso.
  Antes de que exista D.1, la verificación es `pnpm test`, `pnpm typecheck`, `pnpm lint` (que
  compilan antes los paquetes, decisión 125) y `pnpm --filter @buscahogar/web build`.
- **R12 · Next 16.3.4.** Antes de usar una convención de ficheros o una API de Next (`next/font`,
  `loading.tsx`, `error.tsx`, `cookies()`, iconos, transiciones), se consulta su guía en
  `apps/web/node_modules/next/dist/docs/` (lo exige `apps/web/AGENTS.md`). La investigación citó
  documentación de 16.3.8.

---

# Huecos de la investigación y riesgos conocidos

**Huecos aceptados** (la investigación cerró como parcial y el responsable lo aceptó):

| Hueco | Por qué | Dónde se resuelve |
|---|---|---|
| a. Presentación de la ficha (jerarquía del precio, galería, histórico, varias fuentes) | Sin evidencia primaria; Baymard está tras un muro de pago | D.0 decide la dirección con el responsable; D.9 la aplica |
| b. Teselas OSM oscuras con filtro CSS | Solo fuente secundaria sin verificar (S34) | Experimento en D.2; se aplica en D.8b |
| c. Patrón de tokens semánticos que cambian con el tema | Solo fuente secundaria (S35); el cambio en tiempo de ejecución es una inferencia | Experimento en D.2; se aplica en D.3 |

**Riesgos conocidos:**

- **`cookies()` en el layout anula `loading.tsx`.** Leer una cookie en el layout raíz vuelve dinámico
  todo el árbol y bloquea el *fallback* de `loading.tsx` (C20). Lo resuelve D.4 (decisión 144: la cookie se lee
  solo en el script, resuelto), antes de que D.14
  añada los estados de carga. Además, `layout-attribution.test.ts` llama a `RootLayout` de forma
  síncrona, así que un layout asíncrono obliga a cambiar ese test.
- **`error.tsx` es un componente de cliente** (C29), igual que `global-error.tsx`. D.14 tiene que
  ampliar el allowlist de R4 y registrar la decisión.
- **`global-error.tsx` no recibe la clase de tema** (C24, C30): define su propio `<html>` y `<body>`.
  Su aspecto en oscuro se resuelve con `prefers-color-scheme`, no con los tokens del layout.
- **Siembra de la base de datos para las capturas** (D.1). Docker en Windows ya bloqueó los pasos 1.2
  y 2.6. Además, el optimizador de `next/image` descarga en el servidor: una miniatura remota en la
  siembra sería una llamada externa (R8).
- **`no-redirect.test.ts`** rechaza cualquier `redirect(` en `apps/web/src`, incluido
  `NextResponse.redirect(`. Un Route Handler que responda 303 (D.4) construye la respuesta a mano
  (cumplido en D.4, decisión 145).
- ~~**El *matcher* de `apps/web/src/proxy.ts`** solo excluye `favicon.ico` del límite de peticiones. Los
  iconos nuevos de D.5 pasarían por él.~~ Resuelto en D.5 (decisión 149): el matcher excluye por nombre exacto
  `icon`/`icon.svg` y `apple-icon`/`apple-icon.png`.

---

# Bloque 1 — Contexto y herramientas

## [x] D.0 · Contexto de producto y dirección visual

```text
Paso D.0 de docs/DESIGN-ROADMAP.md. No toques código, estilos ni tests.

Carga la skill impeccable. Ejecuta `impeccable init` para crear PRODUCT.md en la raíz
del repositorio y después `impeccable shape` para fijar conmigo la dirección visual.
Antes de decidir nada, pregúntame:

1. Nombre e identidad del producto (hoy «Agregador inmobiliario»), tono y productos
   de referencia.
2. Tipografía: pila del sistema o fuente propia autoalojada (la CSP solo admite
   font-src 'self').
3. Presentación de la ficha de la vivienda: jerarquía del precio, galería, anuncios de
   origen, histórico de precios y ubicación aproximada. La investigación no encontró
   evidencia primaria (hueco a), así que es una decisión de producto.
4. Disposición de la búsqueda: vista dividida lista + mapa en escritorio y lista primero
   con conmutador en móvil, o la alternativa que prefiera.
5. Registro del texto (hoy tuteo) y etiquetas en español para los valores de enumerado
   que hoy salen en crudo («flat», «rent»).

Lee antes CLAUDE.md, docs/ARCHITECTURE.md, las reglas transversales R1-R12 de
docs/DESIGN-ROADMAP.md y la web actual: apps/web/src/app/page.tsx,
apps/web/src/app/properties/[listingId]/page.tsx y apps/web/src/components. Es una
herramienta de búsqueda de uso frecuente con una ficha de lectura: la dirección debe ser
sobria.

Registra el contrato de dirección en docs/DECISIONS.md y anota en las notas de D.9 lo que
afecte a la ficha.
```

**Objetivo.** Tener `PRODUCT.md` y un contrato de dirección visual antes de cambiar un solo estilo.
Resuelve el hueco a.

**Revisar.**

- `PRODUCT.md` describe usuarios, tareas y tono, y no promete funciones que la web no tiene.
- El contrato de dirección fija la intención de la paleta, la tipografía, la densidad, el tono del
  texto y la disposición de la búsqueda, cada punto con su motivo.
- La presentación de la ficha está decidida punto por punto y copiada en las notas de D.9.
- `git status` no muestra cambios bajo `apps/` ni `packages/`.

**Notas:**

- **Ficheros:** `PRODUCT.md` (nuevo), `docs/DECISIONS.md` (132-134), este fichero (D.0, notas de D.9
  y referencias en otros pasos), `docs/PROMPTS.md` y `docs/AI-NOTES.md`. Sin tests.
- **Riesgos:** que la skill elija la marca sin el responsable; los valores por defecto de impeccable
  frente al brief (manda el brief).
- **Tamaño:** S.
- **Evidencia:** C1-C4 (disposición de la búsqueda), C9 (histórico, secundaria); hueco a.
- **Resultado (2026-10-01):** el contrato de dirección queda en la 132 (Buscahogar, herramienta
  factual, pila del sistema, paleta contenida, mundo «Hoja del Mapa Topográfico», búsqueda dividida
  en escritorio y lista primero en móvil). La ficha se decide punto por punto en la 133, copiada
  abajo en D.9, y el registro y las etiquetas en la 134. Hueco a resuelto.
- **impeccable:** `init` escribió `PRODUCT.md`, y `shape` sorteó la dirección (semilla `95c485be`,
  posición 3), que eligió el responsable. Sin generación de imágenes, la ruta es *code-led*. El
  contrato vive en la 132, no en un brief de impeccable, y los pasos que usen la skill se lo pasan.
  `DESIGN.md` y la revisión final llegan en D.17.

---

## [x] D.1 · Verificación visual con Playwright y axe

```text
Paso D.1 de docs/DESIGN-ROADMAP.md. Añade la verificación visual y de accesibilidad de
apps/web. No cambies estilos ni componentes.

- Dependencias de desarrollo en apps/web con versión exacta: @playwright/test y
  @axe-core/playwright. Configuración en apps/web/playwright.config.ts y specs en
  apps/web/e2e/. Scripts test:e2e y test:e2e:update en apps/web/package.json.
- Matriz de proyectos: 320, 768 y 1280 px de ancho, cada uno en tema claro y oscuro con
  la emulación colorScheme.
- Rutas: /, /?view=map, /?q=<frase de ejemplo>, una ficha /properties/<id> y una 404.
- Base de datos dedicada (nombre terminado en _e2e) con un guardián que se niegue a
  sembrar cualquier otra, como el de las bases _bench (decisión 046). Siembra
  determinista: varias fuentes, una vivienda con dos anuncios, un anuncio retirado, una
  vivienda sin anuncios activos y coordenadas para el mapa. Sin miniaturas remotas: el
  optimizador de next/image las descargaría desde el servidor.
- La web arranca con el rol de solo lectura. Las teselas de tile.openstreetmap.org se
  sirven con page.route desde un PNG local, y cualquier otra petición a un host externo
  aborta y hace fallar el test.
- toHaveScreenshot con animations: 'disabled' y máscara sobre lo que cambie entre
  ejecuciones. Las capturas de referencia se generan solo en Docker, con la imagen de
  Playwright de la misma versión que la dependencia.
- Análisis axe con withTags que incluya wcag22aa. Las violaciones actuales se
  registran como punto de partida; no se corrigen en este paso.

Si la previsión supera 800 líneas, parte el paso en D.1a (herramienta y siembra) y D.1b
(specs y capturas de referencia).
```

**Objetivo.** Que desde D.2 cada paso se verifique con capturas reproducibles y un análisis axe, sin
red y sin tocar la base de desarrollo.

**Revisar.**

- Dos ejecuciones seguidas dan el mismo resultado.
- La guarda de red funciona: un test que pide un host externo falla.
- La siembra se niega a ejecutarse contra una base cuyo nombre no termine en `_e2e`.
- Las capturas de referencia versionadas son de Linux.
- `pnpm test` no ejecuta los specs de `e2e/`.
- La lista de violaciones axe de partida queda en las notas.

**Notas:**

- **Ficheros:** `apps/web/package.json`, `apps/web/playwright.config.ts` (nuevo), `apps/web/e2e/`
  (nuevo), script de siembra (nuevo; reutilizar `packages/db/src/seed.ts` solo si encaja),
  `docker-compose.yml` si hace falta un servicio para las capturas. `apps/web/vitest.config.ts` ya
  limita `include` a `test/**`.
- **Tests:** no cambia ninguno existente.
- **Riesgos:** Docker en Windows; capturas inestables por fuentes o teselas; peso de las capturas en
  el repositorio; una siembra que toque la base de desarrollo.
- **Tamaño:** M (posible partición a/b).
- **Evidencia:** C34, C35, C36, C37, C38.
- **Estado (2026-10-01): D.1 hecha (D.1a y D.1b).** D.1a (herramienta y siembra) en un commit propio; D.1b
  (specs, capturas de referencia, línea base axe) en un segundo commit del mismo PR (`size:exception`
  aceptado por el responsable, una rama, dos commits). Decisiones 135-138.
- **D.1a, qué hay:** guard y siembra `_e2e` (`packages/db/src/e2e/`, subpath `@buscahogar/db/e2e`),
  configuración de Playwright con 6 proyectos, guard de red a nivel de contexto con tesela local,
  servicio `e2e` de Compose y `Dockerfile.e2e`, scripts `pnpm e2e` y `pnpm e2e:update`.
- **D.1a, verificación en Docker:** `playwright test --list` muestra 6 proyectos; la siembra ejecutada
  tres veces deja volcados idénticos (37 filas, mismo `sha256`); `web_readonly` puede `SELECT` y no
  puede `INSERT`/`UPDATE`/`DELETE`; la prueba de humo pasa y la autoprueba del guard falla como se
  espera (`test.fail()`). La base de desarrollo se rechaza por nombre antes de abrir una conexión.
- **CSP resuelta:** sobre `http://127.0.0.1:3100` con `next start`, Chromium no aplica
  `upgrade-insecure-requests`; no hace falta ningún apaño en las fixtures (decisión 136).
- **Comprobaciones del diseño (resueltas al aplicar):** `docker compose run --build` existe en
  Compose v5.5.1; `test.fail()` sí cubre un fallo lanzado en el cierre de una fixture automática; el
  mapa `exports` no rompe `pnpm typecheck`, el build web ni los tests de ingestion; el lint no marcó
  el parámetro `use` de la fixture (el plugin de React Hooks no está activo en `apps/web`), aun así se
  llamó `provide`.
- **Nota para D.1b:** el servidor no necesita `WEB_COVERAGE_DATABASE_URL`: la ruta `?q=` solo lee
  (decisión 122) y la zona de Getafe se siembra `covered`, así que no registra barridos.
- **D.1b, qué hay:** `routes.ts` (6 rutas; los identificadores de vivienda salen de `@buscahogar/db/e2e`),
  `visual.spec.ts` (captura de página completa por ruta y proyecto), `a11y.spec.ts` (axe con
  `wcag2a/2aa/21a/21aa/22aa`), `axe-baseline.ts` (lógica pura con 20 tests), `axe-files.ts` y
  `global-teardown.ts`. 36 capturas PNG (6 rutas x 6 proyectos) y `axe-baseline.json`, generados solo en
  Docker con `pnpm e2e:update`.
- **D.1b, verificación en Docker:** una ejecución de actualización y DOS ejecuciones consecutivas de
  `pnpm e2e`, ambas con 74 pasados y 10 omitidos, resultados idénticos por test y sin tocar los baselines. La
  ruta del mapa espera marcadores y teselas cargadas (la tesela es un PNG local); no hizo falta ninguna
  máscara. Las dos 404 (`/no-existe` y vivienda inexistente) producen la misma página y, por tanto, el mismo
  PNG en cada proyecto.
- **Punto de partida de D.15: violaciones axe registradas (solo `target-size`, WCAG 2.5.8, nivel AA):**
  `home` y `map` a 320 px de ancho, en claro y en oscuro (4 de 36 combinaciones).
  - `target-size|a[href="/?view=map"]` en `home` (enlace «Ver mapa»), `w320-light` y `w320-dark`.
  - `target-size|a[href="/?"]` en `map` (enlace «Ver lista»), `w320-light` y `w320-dark`.
  - Las otras 32 combinaciones no registran violaciones. Ojo: la aplicación actual aún no tiene estilos de
    diseño (D.0 solo fijó la dirección), así que el resultado casi limpio no vale para los pasos de estilo:
    cada D.n que cambie la interfaz debe reactualizar la línea base de forma deliberada (decisión 138).
- **Windows no es autoritativo:** una ejecución de `test:e2e` en el anfitrión Windows fallará en las capturas
  por diferencias de fuentes y sistema; es lo esperado, no un fallo que arreglar. Las capturas se generan y
  comprueban solo con `pnpm e2e` / `pnpm e2e:update` (README).

---

## [x] D.2 · Experimentos: tokens semánticos y teselas oscuras

```text
Paso D.2 de docs/DESIGN-ROADMAP.md. Dos experimentos acotados cuyo código NO se queda:
se revierte antes de cerrar el paso. Sigue en la rama actual.

1. Tokens semánticos. En apps/web/src/app/globals.css, variables en :root y en .dark,
   expuestas con @theme inline (por ejemplo --color-surface: var(--surface)) y
   @custom-variant dark. Comprueba que una utilidad como bg-surface cambia en tiempo de
   ejecución al alternar la clase y al emular prefers-color-scheme, sin recompilar.
   Compáralo con light-dark().
2. Teselas oscuras. Filtro CSS (invert, hue-rotate…) aplicado solo al panel de teselas
   de Leaflet, nunca a marcadores, controles ni atribución. Mide la legibilidad y el
   coste con la CPU ralentizada 4x.

Evidencia: capturas de la suite de D.1 a 320 y 1280 px en claro y oscuro. Registra en
docs/DECISIONS.md el resultado de cada experimento y su alternativa si falla: para los
tokens, variables bajo @media o variantes dark: por utilidad; para las teselas, teselas
claras dentro de un marco oscuro.
```

**Objetivo.** Confirmar con pruebas los dos patrones que la investigación solo respaldó con fuentes
secundarias (huecos b y c), antes de que D.3 y D.8b dependan de ellos.

**Revisar.**

- Dos entradas en `docs/DECISIONS.md` con veredicto, capturas y alternativa.
- No queda código del experimento: `git diff` vacío fuera de `docs/`.

**Notas:**

- **Ficheros:** `apps/web/src/app/globals.css` y `apps/web/src/components/search-map-canvas.tsx`
  (temporales, revertidos), `docs/DECISIONS.md`, capturas en `docs/design/spikes/` (nuevo).
- **Tests:** ninguno.
- **Riesgos:** que el código descartable se cuele en un commit.
- **Tamaño:** S.
- **Evidencia:** C17, C22, C23, C25, C26, C27; huecos b y c.
- **Estado (2026-10-05): D.2 hecha.** Cambio SDD `dark-theme-spikes-d2`; un commit solo de `docs/`.
  - **Tokens (decisión 139): VÁLIDO.** Variables en `:root`/`.dark` + `@theme inline` + `@custom-variant dark`
    cambian en tiempo de ejecución, sin recompilar, con la clase y con `prefers-color-scheme` (6 estados, una
    página, sin recarga). `light-dark()` también funciona y se descarta como patrón principal. Hallazgo para
    D.4: la variante `dark:` ignora al sistema sin clase, así que hace falta el script anti-parpadeo que fije la
    clase. Hallazgo para D.3/D.8b: con `color-scheme: light dark` el botón «Dibujar zona» queda blanco sobre
    blanco en oscuro.
  - **Teselas (decisión 140): RECHAZADO por coste; reserva adoptada.** Alcance del filtro correcto (marcadores,
    controles, atribución y todos sus ancestros con `filter: none`) y legible a ojo, pero con CPU 4x la mediana
    del fotograma pasa de 20,83 a 32,72 ms (razón 1,571 > 1,20; 5 ejecuciones por condición). D.8b usa teselas
    claras dentro de un marco oscuro.
  - **Ficheros realmente tocados (todos revertidos):** `globals.css` (variables, `@custom-variant` y el filtro de
    teselas), `layout.tsx` (sonda estática `data-spike-probe` con 3 muestras de color) y
    `e2e/spike-d2.spec.ts` (un spec descartable que importa `./fixtures`, así que el guard de red siguió
    activo). `search-map-canvas.tsx` y el guard NO se tocaron: el filtro vive en `globals.css` y la ruta de
    teselas en el propio spec, a nivel de página. Capturas y `d2-tiles-perf.json` en `docs/design/spikes/`.
  - **Teselas reales:** 24 descargadas una vez con `curl` (la primera tentativa con `Invoke-WebRequest` se quedó
    colgada y se cancelaron sus 0 descargas), en serie, 1 s entre peticiones, `User-Agent`
    «buscahogar-tfm-spike/1.0 (academic, one-off)», a una carpeta fuera del repositorio, montada en solo lectura y
    borrada al final.
  - **Salvedad de la medida:** Docker sin cabeza con compositor por software; solo cifras relativas y pesimistas.
  - **Cierre:** `git status --porcelain -- . ":!docs"` vacío, `baselines/` intacta y `pnpm e2e` completo igual
    que D.1 (ver el informe del cambio).

---

# Bloque 2 — Fundamentos

## [x] D.3 · Tokens, tipografía y tema oscuro del sistema

```text
Paso D.3 de docs/DESIGN-ROADMAP.md. Carga impeccable (con su craft floor antes de editar
UI) y usa `impeccable typeset` y `impeccable colorize` según el contrato de D.0.

- Tokens en apps/web/src/app/globals.css con el patrón validado en D.2: color (superficie,
  texto, texto secundario, borde, acento, peligro, éxito, foco), escala tipográfica,
  espaciado (base 0.25rem de Tailwind), radios, sombras y capas (el mapa necesita
  z-index propios). Los tokens de movimiento se dejan para D.16.
- Tema oscuro solo según el sistema (el selector llega en D.4), con color-scheme en
  :root.
- Fuente según D.0 (decisión 132): pila tipográfica del sistema, declarada en @theme static,
  sin next/font. Ningún host de fuentes remoto; la CSP no cambia.
- Anillo :focus-visible global que el contenido fijo no tape.
- Estilos base mínimos. No rediseñes componentes: eso llega en los pasos siguientes.

Documenta en las notas la tabla de contraste de cada par texto/fondo en ambos temas.
```

**Objetivo.** El sistema de tokens sobre el que se construyen todos los pasos siguientes, con tema
oscuro según el sistema.

**Revisar.**

- `csp-image-policy.test.ts` y `security-headers.test.ts` en verde, con la CSP intacta.
- Ninguna petición a un host de fuentes durante el build ni en la suite de D.1.
- Contraste de al menos 4,5:1 en texto y 3:1 en componentes y foco, en ambos temas.
- Sin violaciones axe nuevas. Capturas en ambos temas.

**Notas:**

- **Ficheros:** `apps/web/src/app/globals.css`. `layout.tsx` no cambia: no hay clase de fuente ni
  `next/font`.
- **Tests:** `security-headers.test.ts` y `csp-image-policy.test.ts` (CSP intacta); `layout-attribution.test.ts`
  sin cambios.
- **Riesgos:** R1 (`font-src 'self'`): sin fuente propia no hay descarga en el build ni fichero que servir.
- **Tamaño:** M.
- **Evidencia:** C10, C21, C22, C25, C26, C27, C32.
- **Contrato de D.0 (132):** pila tipográfica del sistema, sin `next/font` (ver desviaciones);
  paleta `#ffffff`, `#1c1f22`, `#e4e2dc`, acento `#1f5fa8` y siena `#b0662b` solo para la trama;
  escala tipográfica cerrada y cifras tabulares. `#e4e2dc` no llega a 3:1 como borde de control. El
  oscuro se deriva aquí tras D.2.
- **Estado (2026-10-05): D.3 hecha.** Cambio SDD `design-tokens-d3`, un solo PR (`size:exception`, ver
  desviaciones); decisiones 141-143.
  - **Resultado:** `globals.css` pasa de un `@import` a los tokens de color (15, en `:root`, `.dark` y
    `prefers-color-scheme`), la escala tipográfica cerrada (6 roles), radios, sombras, escala z y las reglas
    base (anillo de foco, `scroll-padding-top`, controles con color explícito, `isolation` del mapa). Sin
    `layout.tsx`, CSP ni componentes tocados.
  - **Nombres (141):** `ink`/`rule` en lugar de los roles `text`/`border` de la especificación; extra:
    `surface-raised`, `surface-sunken`, `ink-on-accent`, `selection`, `shadow-color`. `--hatch`, `--selection` y
    `--shadow-color` no tienen utilidad.
  - **Verificación:** `apps/web/test/design-tokens.test.ts` (58 tests) lee el CSS como texto: paridad de los tres
    bloques, mapeo, escalas, reglas base y contraste de ambos temas con OKLCH → sRGB de 8 bits (tolerancia de gamut
    1e-3, decisión 142). La tabla de abajo se copia del snapshot `apps/web/test/__snapshots__/design-tokens.test.ts.snap`.
    Ningún par falló con los valores de partida, así que no hizo falta ajustar ninguna luminosidad.
  - **E2E (Docker):** `pnpm e2e:update` regenera las 36 capturas y la línea base de axe; `pnpm e2e` dos veces
    seguidas, sin diferencias (74 pasan, 10 omitidos). La línea base de axe solo pierde entradas: desaparecen las 4
    de `target-size` (`a[href="/?view=map"]` y `a[href="/?"]` a 320 px en claro y oscuro) y no aparece ninguna
    huella nueva. La causa no se ha investigado; coincide con que los enlaces heredan ahora el interlineado del rol
    de cuerpo.
  - **Pendiente de D.8b:** el aviso `<p role="status">` de la barra de dibujo del mapa conserva colores claros fijos
    en oscuro, y el botón «Dibujar zona» hereda la regla base de `button` (fondo oscuro sobre la caja blanca de la
    barra). Los controles de Leaflet mantienen los colores de su hoja. Las cifras tabulares no se definen aquí:
    Tailwind ya trae `tabular-nums`, que se aplicará en D.6b/D.9.
  - **Contraste (copiado del snapshot, ratio WCAG con colores de 8 bits; mínimo 4,5 en texto y 3 en no texto; cada
    fila indica el par y los hex resultantes):**

  | Tema | Primer plano | Fondo | Colores | Ratio | Mínimo | Resultado |
  | ---- | ------------ | ----- | ------- | ----- | ------ | --------- |
  | claro | ink | surface | #1c1f22 sobre #ffffff | 16.56 | 4.5 | cumple |
  | claro | ink | surface-raised | #1c1f22 sobre #ffffff | 16.56 | 4.5 | cumple |
  | claro | ink | surface-sunken | #1c1f22 sobre #f6f5f2 | 15.18 | 4.5 | cumple |
  | claro | ink-muted | surface | #5d6469 sobre #ffffff | 6.01 | 4.5 | cumple |
  | claro | ink-muted | surface-raised | #5d6469 sobre #ffffff | 6.01 | 4.5 | cumple |
  | claro | ink-muted | surface-sunken | #5d6469 sobre #f6f5f2 | 5.52 | 4.5 | cumple |
  | claro | accent | surface | #1f5fa8 sobre #ffffff | 6.44 | 4.5 | cumple |
  | claro | accent | surface-raised | #1f5fa8 sobre #ffffff | 6.44 | 4.5 | cumple |
  | claro | accent | surface-sunken | #1f5fa8 sobre #f6f5f2 | 5.91 | 4.5 | cumple |
  | claro | danger | surface | #b6322d sobre #ffffff | 6.03 | 4.5 | cumple |
  | claro | danger | surface-raised | #b6322d sobre #ffffff | 6.03 | 4.5 | cumple |
  | claro | danger | surface-sunken | #b6322d sobre #f6f5f2 | 5.53 | 4.5 | cumple |
  | claro | ink | selection | #1c1f22 sobre #cce0f9 | 12.30 | 4.5 | cumple |
  | claro | ink-on-accent | accent | #ffffff sobre #1f5fa8 | 6.44 | 4.5 | cumple |
  | claro | rule-control | surface | #81878b sobre #ffffff | 3.64 | 3 | cumple |
  | claro | rule-control | surface-raised | #81878b sobre #ffffff | 3.64 | 3 | cumple |
  | claro | rule-control | surface-sunken | #81878b sobre #f6f5f2 | 3.34 | 3 | cumple |
  | claro | focus | surface | #1f5fa8 sobre #ffffff | 6.44 | 3 | cumple |
  | claro | focus | surface-raised | #1f5fa8 sobre #ffffff | 6.44 | 3 | cumple |
  | claro | focus | surface-sunken | #1f5fa8 sobre #f6f5f2 | 5.91 | 3 | cumple |
  | claro | hatch | surface | #b0662b sobre #ffffff | 4.39 | 3 | cumple |
  | claro | hatch | surface-sunken | #b0662b sobre #f6f5f2 | 4.03 | 3 | cumple |
  | oscuro | ink | surface | #e6e4df sobre #131719 | 14.20 | 4.5 | cumple |
  | oscuro | ink | surface-raised | #e6e4df sobre #1b2023 | 12.94 | 4.5 | cumple |
  | oscuro | ink | surface-sunken | #e6e4df sobre #0a0e10 | 15.26 | 4.5 | cumple |
  | oscuro | ink-muted | surface | #98a0a5 sobre #131719 | 6.79 | 4.5 | cumple |
  | oscuro | ink-muted | surface-raised | #98a0a5 sobre #1b2023 | 6.19 | 4.5 | cumple |
  | oscuro | ink-muted | surface-sunken | #98a0a5 sobre #0a0e10 | 7.30 | 4.5 | cumple |
  | oscuro | accent | surface | #6aa9ed sobre #131719 | 7.31 | 4.5 | cumple |
  | oscuro | accent | surface-raised | #6aa9ed sobre #1b2023 | 6.66 | 4.5 | cumple |
  | oscuro | accent | surface-sunken | #6aa9ed sobre #0a0e10 | 7.86 | 4.5 | cumple |
  | oscuro | danger | surface | #f07f77 sobre #131719 | 6.88 | 4.5 | cumple |
  | oscuro | danger | surface-raised | #f07f77 sobre #1b2023 | 6.27 | 4.5 | cumple |
  | oscuro | danger | surface-sunken | #f07f77 sobre #0a0e10 | 7.39 | 4.5 | cumple |
  | oscuro | ink | selection | #e6e4df sobre #1f446b | 7.88 | 4.5 | cumple |
  | oscuro | ink-on-accent | accent | #131719 sobre #6aa9ed | 7.31 | 4.5 | cumple |
  | oscuro | rule-control | surface | #6e767b sobre #131719 | 3.90 | 3 | cumple |
  | oscuro | rule-control | surface-raised | #6e767b sobre #1b2023 | 3.55 | 3 | cumple |
  | oscuro | rule-control | surface-sunken | #6e767b sobre #0a0e10 | 4.19 | 3 | cumple |
  | oscuro | focus | surface | #6aa9ed sobre #131719 | 7.31 | 3 | cumple |
  | oscuro | focus | surface-raised | #6aa9ed sobre #1b2023 | 6.66 | 3 | cumple |
  | oscuro | focus | surface-sunken | #6aa9ed sobre #0a0e10 | 7.86 | 3 | cumple |
  | oscuro | hatch | surface | #d28c58 sobre #131719 | 6.56 | 3 | cumple |
  | oscuro | hatch | surface-sunken | #d28c58 sobre #0a0e10 | 7.05 | 3 | cumple |

---

## [x] D.4 · Selector de tema

```text
Paso D.4 de docs/DESIGN-ROADMAP.md. Añade un selector de tema (claro, oscuro, sistema)
sin componentes de cliente nuevos.

- Un script en línea en el <head> del layout lee la cookie de tema y pone la clase
  antes del primer pintado. La CSP lo admite ('unsafe-inline').
- El selector es un <form method="post"> que envía a un Route Handler nuevo
  (apps/web/src/app/theme/route.ts). El handler valida con Zod el valor y la ruta de
  vuelta (solo rutas relativas del mismo origen: rechaza //host y URL absolutas), fija
  la cookie y responde 303 con una Response construida a mano: no-redirect.test.ts
  prohíbe cualquier llamada a redirect(.
- Decide y registra en docs/DECISIONS.md cómo se lee la cookie. Llamar a cookies() en el
  layout raíz hace dinámico todo el árbol y anula el fallback de loading.tsx que añade
  D.14. Compara al menos: (a) leerla solo en el script, de modo que sin JS se sigue el
  tema del sistema; (b) leerla en el layout y poner los límites de carga por segmento;
  (c) leerla en cada página. Indica qué pasa sin JavaScript en cada caso.
- El selector se coloca de forma provisional; D.5 lo integra en la cabecera.
```

**Objetivo.** Que el usuario pueda fijar el tema sin parpadeo y sin romper R4, R5 ni el plan de
carga de D.14.

**Revisar.**

- Sin parpadeo al recargar con caché desactivada, en ambos temas.
- Sin JavaScript, el formulario fija la cookie y responde 303, y la consecuencia elegida está
  documentada.
- Zod rechaza valores desconocidos; la ruta de vuelta rechaza `//evil.example` y `https://…`.
- El allowlist de R4 sigue con dos ficheros. `POST /theme` pasa por el límite de `proxy.ts`.

**Notas:**

- **Ficheros:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/theme/route.ts` (nuevo),
  `apps/web/src/app/globals.css`.
- **Tests:** test nuevo del Route Handler; `layout-attribution.test.ts` (si el layout pasa a ser
  asíncrono), `no-redirect.test.ts`, `no-client-directive.test.ts`, `proxy-config.test.ts`.
- **Riesgos:** C20 (riesgo conocido); redirección abierta en la ruta de vuelta; cookie de
  preferencia con `SameSite=Lax` y sin datos personales.
- **Tamaño:** S-M.
- **Evidencia:** C17, C18, C19, C20, C21.
- **Hecho (2026-10-05):** decisiones 144-146. La cookie se lee solo en el script en línea (opción a de la 144):
  el layout sigue síncrono y estático, y el *fallback* de `loading.tsx` de D.14 queda intacto. `POST /theme` (solo
  `POST`, 303 a mano, ruta de vuelta validada dos veces) y selector provisional en el pie, con estado actual solo
  visual por CSS. Sin JavaScript el formulario guarda la cookie y responde 303, pero no hay clase y se sigue el tema del
  sistema. Commits 4b9e04f, 160d212, 6dc8b88 y ea5b6e7. Nuevo `layout-theme.test.ts` y spec e2e `theme.spec.ts`;
  `pnpm e2e` final: 81 superados, 45 omitidos; la línea base de axe no cambia.

---

## [x] D.5 · Estructura común: cabecera, pie y metadatos

```text
Paso D.5 de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable clarify`.

- Cabecera con la marca de D.0, acceso a la búsqueda y el selector de D.4.
- Enlace «Saltar al contenido» como primer elemento enfocable, hacia
  <main id="contenido">. Un solo <main> por página y regiones bien etiquetadas.
- El pie conserva literal la atribución CC-BY del IGN/CNIG (R7). La de OpenStreetMap
  sigue en el mapa.
- Metadatos: title.template en el layout y título propio en la ficha con
  generateMetadata, sin repetir la consulta (React cache). Iconos con las convenciones
  de app/ (icon.svg, apple-icon.png). El matcher de src/proxy.ts solo excluye
  favicon.ico: decide si los iconos nuevos quedan fuera del límite de peticiones.
- Quita de page.tsx la línea de desarrollo «Esqueleto del monorepo · v{WEB_VERSION}»
  y apps/web/src/version.ts si queda sin uso.
- Anchos de contenedor y márgenes con los tokens de D.3, a 320, 768 y 1280 px.
```

**Objetivo.** Una estructura común accesible en todas las páginas, sin texto de desarrollo a la vista.

**Revisar.**

- El enlace de salto es el primer elemento enfocable y se ve al recibir el foco.
- Atribución del IGN idéntica y visible. Título distinto en la ficha. Iconos servidos.
- Las reglas axe de regiones pasan. Capturas a los tres anchos.

**Notas:**

- **Ficheros:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`,
  `apps/web/src/app/properties/[listingId]/page.tsx`, `apps/web/src/components/site-header.tsx`
  (nuevo), `apps/web/src/app/icon.svg` (nuevo), `apps/web/src/proxy.ts`, `apps/web/src/version.ts`.
- **Tests:** `layout-attribution`, `architecture-attribution`, `home-page-map`, `home-page-nl`,
  `property-detail-page`, `proxy-config`.
- **Riesgos:** R6; una segunda consulta en `generateMetadata`.
- **Tamaño:** M.
- **Evidencia:** C10, C31.
- **Hecho (2026-10-05):** decisiones 147-150. El layout es dueño de `<main id="contenido">`, del enlace de salto y del pie;
  la cabecera estática (`site-header.tsx`) lleva la marca, `nav` «Principal» y el selector de tema. Un solo `<main>`,
  `banner`, `contentinfo` y `h1` en las 6 rutas, 404 incluidas. `title.template` y `generateMetadata` con `cache()` de
  React (una sola consulta). Iconos `icon.svg` y `apple-icon.png` (rasterizado dentro de la imagen Docker del e2e,
  decisión 149); `proxy.ts` los excluye por nombre exacto. Forma de URL real con Turbopack: `/icon.svg?icon.<hash>.svg` y
  `/apple-icon.png?apple-icon.<hash>.png`. Eliminados la línea de desarrollo de `page.tsx` y `version.ts`. La 404 por
  defecto conserva su `height:100vh` en línea y su título en inglés hasta D.14. Commits 6c7d9e7, 68e21c1, d211ec1,
  fc893e6 y el de documentación. Tests unitarios: `pnpm test` con 458 en `apps/web` (core 802, db 290, ingestion 842);
  tests nuevos `layout-shell`, `property-detail-metadata`, `app-icons` y spec e2e `landmarks.spec.ts`. `pnpm e2e` final:
  173 superados, 145 omitidos; las 36 capturas regeneradas en Docker; la línea base de axe no cambia.

---

# Bloque 3 — Búsqueda y mapa

## [x] D.6a · Búsqueda: barra de filtros y filtros aplicados

```text
Paso D.6a de docs/DESIGN-ROADMAP.md. Usa `impeccable layout`, `impeccable clarify` y
`impeccable extract` cuando un campo se use por segunda vez.

- Filtros estructurados en la página principal, que hoy solo los ofrece tras interpretar
  una frase. Un formulario GET con form=criteria (decisión 123) que produce exactamente
  los parámetros que valida searchQuerySchema
  (packages/core/src/schemas/search-query.schema.ts).
- En escritorio, barra horizontal sobre los resultados, con los filtros esenciales
  primero y etiquetas sin jerga (search-labels.ts).
- Resumen de filtros aplicados con sus valores reales. Cada uno es un enlace que quita
  solo ese parámetro y conserva los demás (view, polygon, page…), más «Quitar todos». En
  móvil, una fila con desplazamiento horizontal.
- Recuento de resultados visible. Solo el que la consulta ya devuelve: no se añade una
  consulta de total en un paso de diseño.
- Comparte campos con CriteriaForm (rama ?q=) en vez de duplicarlos. Sin JavaScript.
```

**Objetivo.** Que filtrar sea directo y visible, sin tocar el contrato de la URL.

**Revisar.**

- Enviar cada filtro produce la misma URL que escribirla a mano.
- Cada filtro aplicado quita un único parámetro. Un parámetro inválido sigue tratándose con Zod.
- Funciona sin JS. A 320 px no hay desplazamiento horizontal de página.

**Notas:**

- **Ficheros:** `apps/web/src/app/page.tsx` (476 líneas: extraer secciones),
  `apps/web/src/components/criteria-form.tsx`, `apps/web/src/lib/search-labels.ts`,
  `apps/web/src/lib/search-href.ts`, `apps/web/src/components/applied-filters.tsx` (nuevo).
- **Tests:** `home-page-nl`, `home-page-map`, `search-href`, un test nuevo de los filtros aplicados.
- **Riesgos:** R3 y la decisión 123; crecimiento de `page.tsx`.
- **Tamaño:** L, mitad a.
- **Evidencia:** C2, C5, C6, C7.
- **Hecho (2026-10-05):** decisión 151. `CriteriaFields` (nuevo, `criteria-fields.tsx`) comparte los diez campos entre
  el panel de `?q=` y la barra; con el prefijo `criteria` el panel queda idéntico byte a byte (comprobado con una prueba
  de aprobación) y la captura `nl-query` no cambia. `FilterBar` (GET, `form=criteria`, `aria-label` «Filtros de
  búsqueda», sin `role="search"`) se pinta bajo la caja de texto en la rama válida y, con los valores recibidos, en la de
  parámetros inválidos; reenvía vista, polígono, zona y radio en ocultos y nunca `page`. `AppliedFilters` pinta el
  recuento (también con 0) y un enlace «Quitar …» por filtro, con «Quitar todos» desde dos. El recuento de la lista es
  completo solo en la página 1 sin página siguiente (`formatListCount`); el del mapa pasó a la fila de resumen. Sin
  consultas nuevas, sin `'use client'` nuevo y `searchQuerySchema` sin cambios. Construcción de href en `search-href.ts`
  (`buildRemoveFilterHref`, `buildClearFiltersHref`, `pickFilterBarContext`, más `buildPageHref` y `buildCurrentHref`
  movidos desde `page.tsx`, que baja de 476 a 451 líneas) y rótulos en `search-labels.ts`. Commits 373bfe2,
  0c0fa49, d62a830, 3786d61 y el de documentación. Tests unitarios: `pnpm test`: 524 en `apps/web` (458 antes), core 802,
  db 290, ingestion 842; tests nuevos `search-filters.test.tsx` y ampliaciones de `search-href`, `home-page-nl`,
  `home-page-map` y `page-coverage-degradation`. E2E: ruta nueva `home-filtered` (nueve chips) y `filters.spec.ts`;
  `pnpm e2e` final: 214 superados, 188 omitidos; regeneradas en Docker las 18 capturas de `home`, `map` y
  `home-filtered` (las de `nl-query` no cambian) y la línea base de axe solo añade `home-filtered` sin violaciones.
  El e2e halló un desbordamiento horizontal a 320 px por el texto `sr-only` dentro de la lista de chips con
  desplazamiento (corregido con `position: relative`; ver `docs/AI-NOTES.md`). La bandeja móvil, el pulido de la fila
  de chips (sombras de desbordamiento) y el estado vacío siguen en D.6b y D.14.

---

## [x] D.6b · Resultados: tarjetas, bandeja de filtros en móvil y paginación

```text
Paso D.6b de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable clarify`.

- Tarjeta de resultado: precio destacado (format-price.ts), etiquetas en español para el
  tipo y la operación (hoy salen «flat» y «rent»), insignia «Disponible en N fuentes»,
  imagen con next/image y sizes, y un estado sin imagen diseñado. Un único enlace por
  tarjeta, con foco y hover visibles. Decide la política de alt: decorativa solo si el
  texto de la tarjeta ya lo dice todo.
- Rejilla de una, dos o tres columnas según el ancho.
- Orden y paginación con anterior y siguiente claros e indicador de página.
- Bandeja de filtros en móvil sin JavaScript: <details>/<summary> con la etiqueta
  «Filtros» y el número de filtros activos, que contiene el formulario de D.6a. La
  actualización en vivo exigiría un componente de cliente (R4) y queda fuera salvo
  decisión expresa.
```

**Objetivo.** Resultados legibles y comparables de un vistazo, en móvil y en escritorio.

**Revisar.**

- Objetivos táctiles de al menos 24 px. Sin saltos de diseño al cargar las imágenes.
- `csp-image-policy.test.ts` en verde. La bandeja funciona con teclado y sin JS.
- Capturas a los tres anchos y en ambos temas.

**Notas:**

- **Ficheros:** `apps/web/src/components/result-card.tsx`, `apps/web/src/app/page.tsx`,
  `apps/web/src/lib/format-price.ts`, `apps/web/src/lib/search-labels.ts`,
  `apps/web/src/components/thumbnail-source.ts`.
- **Tests:** `result-card`, `csp-image-policy`, `home-page-map`, `home-page-nl`.
- **Riesgos:** R6; la política de `alt`.
- **Tamaño:** L, mitad b.
- **Evidencia:** C5, C8, C12.
- **Contrato de D.0 (132, 134):** filas densas con el precio en una columna derecha fija y cifras
  tabulares, en lugar de la rejilla de una a tres columnas (ver desviaciones); tipo y operación con
  los rótulos de `search-labels.ts`.
- **Hecho (2026-10-06):** decisiones 152-156. Siete fases, un commit por fase. `ResultCard` es una fila densa (miniatura
  4:3 con `next/image` `fill` y `sizes`, precio, «Piso · Venta», cifras con `tabular-nums`, dirección y la insignia
  «Disponible en N fuentes»), con rótulos de `propertyTypeLabel`/`operationLabel` (nunca el valor crudo) y la política de
  `alt` de `resolveThumbnailAlt`; sin miniatura, «Sin foto» oculto a lectores. `Pagination` (nuevo) se oculta con una sola
  página y pinta el extremo que no existe como texto. `FilterBar` va dentro de `<details class="filter-tray">`: cerrado en
  móvil, abierto con parámetros inválidos y siempre visible desde 64rem solo dentro de `@supports selector(::details-content)`;
  el número de filtros activos sale de `countTrayFilters`. Sin `'use client'` nuevo, sin cambios en `remotePatterns` ni en la
  CSP, sin consulta nueva. `formatListCount` deja de añadir « · página N»: el paginador es el único indicador de página.
- **Verificaciones al aplicar (F1, F2):** (F1) `next build` conserva en el CSS final `@supports selector(::details-content)` y
  `::details-content` (Lightning CSS solo reescribe `width >= 64rem` como `min-width:64rem`), así que no hizo falta el plan de
  reserva. (F2) Chromium, en Docker: a 320 px la bandeja llega cerrada, Tab y Enter sobre el resumen la abren, el siguiente
  Tab entra en «Operación» y el envío funciona con `javaScriptEnabled: false`; a 1280 px el resumen está oculto, el
  formulario visible y Tab llega al primer campo. Firefox (Playwright, mismos dos anchos): los 28 tests de
  `filter-tray.spec.ts` y `filters.spec.ts` pasan. WebKit: no verificable en este arnés, porque la CSP de producción con
  `upgrade-insecure-requests` hace que cargue `https://127.0.0.1:3100` y el guard de red aborta todos los tests (también los
  de D.6a); queda pendiente la comprobación manual en Safari.
- **Tests y e2e:** `pnpm --filter @buscahogar/web test`: 579 (524 antes). Tests nuevos: `search-labels`, `pagination`,
  `filter-tray-css` (la regla que oculta el resumen solo existe dentro de `@supports`) y ampliaciones de `result-card`,
  `thumbnail-source`, `search-filters` y `home-page-nl`; `csp-image-policy` sigue en verde sin tocarse. E2E:
  `filter-tray.spec.ts` (nuevo: S19, S20, desbordamiento a los tres anchos y ambos temas con la bandeja cerrada y abierta,
  la caja 4:3 y un único enlace por fila, objetivos del paginador) y `filters.spec.ts` abre la bandeja a 320 px; `pnpm e2e`
  final: 244 superados, 218 omitidos. Regeneradas en Docker 14 de las 18 capturas de `home`, `map` y `home-filtered` (a
  1280 px solo cambia `home`); la línea base de axe no cambia (sin violaciones).
- **Fuera del seed:** el seed tiene seis viviendas, menos de una página, así que no hay captura del paginador ni miniaturas
  reales; la caja es la misma en ambos estados y los tests de marcado cubren las propiedades de `Image`. El paginador se
  comprueba en e2e con `/?page=2`.

---

## [x] D.7 · Búsqueda en lenguaje natural: interpretación y confirmación

```text
Paso D.7 de docs/DESIGN-ROADMAP.md. Usa `impeccable clarify` y `impeccable layout`.

Rediseña la rama ?q= del paso 3.1 sin cambiar su comportamiento: interpreta y pide
confirmación, nunca busca (decisión 122).

- Pasos visibles: describe, revisa y busca. Texto de ejemplo en el campo y un nombre
  claro para el botón, que hoy dice «Interpretar» (acordarlo conmigo).
- La interpretación se muestra como campos editables agrupados y como resumen con los
  mismos componentes de D.6a.
- Lo no reconocido y los conflictos, con jerarquía visual y role=status o role=alert
  según corresponda.
- Elección de lugar inequívoca cuando hay varias coincidencias.
- Sin JavaScript. No toques el intérprete de packages/core ni su corpus.
```

**Objetivo.** Que el flujo de dos pasos (interpretar y luego buscar) se entienda sin explicaciones.

**Revisar.**

- `home-page-nl.test.tsx` en verde, actualizado sin cambiar lo que afirma.
- Los tests y el corpus de `packages/core` no cambian.
- Las regiones de estado no se duplican. Capturas.

**Notas:**

- **Ficheros:** `apps/web/src/components/search-text-form.tsx`,
  `apps/web/src/components/criteria-form.tsx`, `apps/web/src/app/page.tsx`.
- **Tests:** `home-page-nl`.
- **Riesgos:** R6 y los tests del 3.1.
- **Tamaño:** M.
- **Evidencia:** C6, C7, C13.
- **Registro (134):** tuteo uniforme; se reescriben «Esto es lo que he entendido», «No he
  entendido:» y «No se pudo interpretar la búsqueda».
- **Hecho (2026-10-06):** decisiones 157-162. Tres fases de código y una de documentación, un commit por unidad. Acordado con
  el responsable: botón «Convertir en filtros»; ejemplo como texto de ayuda persistente («Piso en alquiler en Getafe hasta
  900 € con 2 habitaciones»), no placeholder; pasos Describe/Revisa/Busca solo en el inicio sin parámetros y en `?q=`; resumen
  de solo lectura; un único bloque «Partes sin reconocer» e «Indicaciones contradictorias»; un único `role="status"` que
  menciona la zona pendiente y `role="alert"` solo para el rechazo del esquema (frase previa y literal de Zod) y para `q`
  inválido; grupos con preguntas como título; «Sin zona (cualquier municipio)». La zona tiene cuatro estados (sin lugar, no
  encontrado, exacto, elegir) y un candidato único por prefijo no se preselecciona ni se describe como «varios».
- **Tests y e2e:** web: 621 (579 antes). `home-page-nl` actualiza solo los dos literales autorizados («Partes sin
  reconocer»); `search-labels` y `search-filters` se amplían. E2E: `nl-confirmation.spec.ts` (nuevo, incluido el flujo sin
  JavaScript); `pnpm e2e update` en Docker: 267 superados y el fallo previsto de S8.3. Regeneradas las 24 capturas de
  `home`, `map`, `home-filtered` y `nl-query`; la línea base de axe no cambia. No se tocan el intérprete ni el corpus de
  `packages/core`, ni el texto de la rama de parámetros inválidos (D.14).

---

## [x] D.8a · Mapa: disposición y marcadores

```text
Paso D.8a de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable adapt`.

- Disposición según D.0. Por defecto: vista dividida lista + mapa en escritorio, sin
  superposiciones que tapen el mapa, y lista primero con conmutador hacia el mapa en
  móvil. El conmutador sigue siendo un enlace con el parámetro view. Si la vista
  dividida necesita las dos consultas en la misma petición, mide el coste frente a los
  objetivos del paso 2.4.
- Altura del mapa adaptable, en lugar del MAP_STYLE fijo de 520 px de
  search-map-canvas.tsx.
- Etiquetas de precio y grupos de map-cluster-layer.tsx con variables CSS en lugar de los
  colores hexadecimales en línea. Sigue creando nodos con textContent, nunca HTML en
  cadena (map-guards.test.ts).
- Marcadores con título descriptivo, popup diseñado y estado de carga de search-map.tsx.
- Barra de dibujo de map-draw-control.tsx (hoy TOOLBAR_STYLE en línea) con los tokens.
- Mantén literal el host de teselas y la atribución de OSM, y la alternativa noscript.
```

**Objetivo.** Un mapa integrado en el sistema visual y adecuado a cada ancho.

**Revisar.**

- No quedan colores hexadecimales en línea en los módulos del mapa.
- `map-guards.test.ts` en verde. Los marcadores se alcanzan con el teclado.
- La alternativa sin JS funciona. Capturas a los tres anchos, con las teselas falsas de D.1.

**Notas:**

- **Ficheros:** `apps/web/src/components/search-map.tsx`,
  `apps/web/src/components/search-map-canvas.tsx`, `apps/web/src/components/map-cluster-layer.tsx`,
  `apps/web/src/components/map-draw-control.tsx`, `apps/web/src/app/page.tsx`,
  `apps/web/src/app/globals.css`.
- **Tests:** `map-guards`, `home-page-map`.
- **Riesgos:** especificidad del CSS de Leaflet; orden de imports de `leaflet.markercluster` (riesgo
  abierto del 2.6); R4 (sin ficheros de cliente nuevos).
- **Tamaño:** L, mitad a.
- **Evidencia:** C1, C2, C3, C4, C14, C34.
- **Contrato de D.0 (132):** confirmada la disposición por defecto (dividida en escritorio, lista
  primero con «Ver mapa» en móvil). El mapa va enmarcado como una hoja, con un solo filete y sin más
  marginalia. Aquí se decide la disposición a 768 px.
- **Resultado:** lista y mapa conviven en toda búsqueda válida (decisión 163, enmienda la 118): las dos consultas corren en
  paralelo en cada petición y `view` solo elige el panel visible bajo 64rem (decisión 164; 768 px sigue el patrón estrecho,
  lista primero con «Ver mapa»). Desde 64rem, rejilla lista + mapa con el mapa `sticky` y el conmutador oculto. Cada aviso se
  renderiza una sola vez (matriz SMV-17): el recuento de la lista en el resumen, los del mapa en su sección y el aviso de zona
  sin cobertura en una región compartida. Marco con hairline y altura adaptable, con el aviso de carga dentro del mismo marco.
  Marcadores, clústeres, popup, zoom, atribución y barra de dibujo con clases y tokens en `search-map-canvas.css` (decisión
  165); nombres accesibles en español (decisión 166); reencuadre del mapa montado oculto con `ResizeObserver` (decisión 167).
- **Ficheros reales:** además de los de la lista: `search-map-canvas.css` (nuevo), `lib/search-labels.ts`,
  `e2e/routes.ts`, `e2e/search-map.spec.ts` (nuevo), los tests `home-page-map`, `search-split-css` (nuevo), `home-page-nl`,
  `db/page-coverage-degradation`, `search-labels` y `map-guards`, y `docs/SEARCH-PERFORMANCE.md` (estimación analítica: el peor
  p95 medido de la lista es 205,0 ms y el del mapa 368,7 ms, así que la petición ronda 369 ms, por debajo de 500; sin
  escenario de banco nuevo).
- **Decisiones:** 163-167. La numeración se partió entre las dos unidades de trabajo: la unidad A dejó escritas 163, 164 y 167 y la
  B rellenó 165 y 166.
- **Tests y e2e:** web: 659 (637 tras la unidad A). `map-guards` conserva todas sus aserciones y añade las de tokens, orden de
  imports, barra por portal y fuera de alcance de D.8b; `search-labels` cubre títulos y unidad del clúster. E2E:
  `search-map.spec.ts` (nuevo: sin desbordamiento a los tres anchos, ruta de teclado de marcador a «Ver vivienda» a 1280, mapa
  oculto a 320, cruce de 64rem de 768 a 1280); `pnpm e2e update` en Docker: 290 superados, 280 omitidos y el fallo previsto de
  S8.3. Regeneradas 10 capturas: `map` en los seis proyectos y `home` y `home-filtered` a 1280 px; las de 320 y 768 de
  `home` y `home-filtered` no cambian (la lista sigue primero); la línea base de axe no cambia.
- **Tamaño:** un solo PR con `size:exception`, aceptado por el responsable, con commits por unidad (A: código y documentación;
  B: código, e2e con capturas y documentación); ~1500 líneas autoradas frente a las ~885 previstas (la hoja del mapa y el e2e superaron la previsión), sin
  contar las capturas. No se recortaron tests, comentarios ni documentación.
- **Fuera de alcance (D.8b):** teselas oscuras, dibujo con teclado y botones de dibujo de 24 px.

---

## [x] D.8b · Mapa: tema oscuro y dibujo accesible

```text
Paso D.8b de docs/DESIGN-ROADMAP.md. Usa `impeccable harden`.

- Teselas en tema oscuro según el resultado de D.2: filtro solo en el panel de teselas,
  o su alternativa. Marcadores, controles y atribución sin filtrar.
- Dibujo de zona accesible: sin arrastrar (WCAG 2.5.7, un clic por vértice) y con una
  alternativa de teclado; por ejemplo, una mira en el centro que se mueve con las
  flechas y un botón «Añadir vértice». Botones de al menos 24 px y mensajes con
  role=status.
- La lógica nueva va al reductor draw-polygon-state.ts, con tests.
```

**Objetivo.** Que el mapa se lea en oscuro y que dibujar una zona no exija ratón ni arrastre.

**Revisar.**

- Se dibuja y se cierra un polígono solo con teclado.
- `draw-polygon-state.test.ts` cubre la alternativa de teclado.
- Legibilidad en oscuro en las capturas y coste aceptable con la CPU ralentizada.

**Notas:**

- **Ficheros:** `apps/web/src/components/map-draw-control.tsx`,
  `apps/web/src/components/draw-polygon-state.ts`, `apps/web/src/components/search-map-canvas.tsx`,
  `apps/web/src/app/globals.css`.
- **Tests:** `draw-polygon-state`, `map-guards`.
- **Riesgos:** rendimiento del filtro en equipos modestos; cambios en el reductor.
- **Tamaño:** L, mitad b.
- **Evidencia:** C11, C12, C13, C14, C23; hueco b.
- **Estado (2026-10-06): D.8b hecha.** Aplicada en tres unidades de trabajo (SDD, Engram `sdd/search-map-d8b/*`) con un PR
  `size:exception` y commits `cc8ad32` (reductor), `903a802` (control, mira y hoja), `31b5359` (arreglo de las clases de
  las capas), `74fa18a` (e2e y capturas) y el de documentación. El paso se pausó tras el diseño y se retomó en otra sesión.
  Decisiones de producto confirmadas antes de aplicar:
  - Teselas: se mantiene la decisión 140, teselas claras en un marco oscuro, sin filtro ni velo (cero código, y una guarda
    en `map-guards` que impide añadir uno).
  - Teclado: mira fija en el centro, desplazamiento nativo con las flechas y «Añadir vértice».
  - Atajos: Enter, Retroceso y Escape, solo mientras se dibuja y con el contenedor del mapa enfocado.
  - Errores: textos en español sin el prefijo `polygon:`.
  - Al salir del mapa a mitad de dibujo, los vértices se conservan.
- **Qué hay:** reductor con textos por acción, guarda de duplicados consecutivos y tope de 50 (decisión 169); control con
  `keydown` en el contenedor, «Añadir vértice», mira `aria-hidden` y foco devuelto a «Dibujar zona» (170); anfitrión de la barra
  antepuesto al marco y fila con salto de línea con botones de 1,5 rem (168). Decisiones 168-170.
- **Tests y e2e:** web: 685 (`draw-polygon-state`: 27; `map-guards`, `design-tokens`). `search-map.spec.ts` añade 13 pruebas de
  dibujo por teclado en los seis proyectos (dibujar y cerrar solo con teclado con puerta de consola, Retroceso y Escape,
  vértice dentro de 2 px de la mira, «Añadir vértice» y duplicado, clic sin arrastrar, foco, Escape con ventana abierta,
  Intro y Retroceso en el enlace de la ventana, Tab que sale del mapa, botones de 24 px, mira sin solapes, axe `wcag22aa` y
  captura del marco). `pnpm e2e update` en Docker: 368 superados y 280 omitidos; dos ejecuciones consecutivas de `pnpm e2e`,
  ambas 368 y 280 sin tocar capturas. Seis capturas nuevas (`draw-frame.png`, una por proyecto); `map` no cambia (la barra en
  reposo es igual); la línea base de axe no cambia.
- **Hallazgo del e2e:** las clases `map-area`, `map-draw-path` y `map-draw-vertex` nunca llegaban al SVG (decisión 170, enmienda a
  la 165; `AI-NOTES.md`). Arreglado en `31b5359` con una guarda de regresión.
- **Ficheros reales:** `draw-polygon-state.ts`, `map-draw-control.tsx`, `search-map-canvas.css`, `search-map-canvas.tsx` (solo
  `className="map-area"`), `e2e/search-map.spec.ts` y los tests `draw-polygon-state`, `map-guards` y `design-tokens`.
- **Tamaño:** un solo PR con `size:exception`, aceptado por el responsable, con commits por unidad; ~830 líneas de código, tests y
  e2e más la documentación obligatoria, sin contar las capturas. No se recortaron tests, comentarios ni documentación.

---

# Bloque 4 — Ficha de la vivienda

## [x] D.9 · Ficha: presentación

```text
Paso D.9 de docs/DESIGN-ROADMAP.md. Aplica la presentación de la ficha decidida en D.0
(está en las notas de este paso). Usa `impeccable layout`, `impeccable typeset` y
`impeccable clarify`.

- Cabecera estructurada: precio destacado (el más económico de los anuncios activos,
  decisión 109), datos clave en una lista de definiciones, etiquetas en español y
  descripción en párrafos. «No consolidado — ver anuncios de origen» se explica una vez,
  no en cada campo.
- Galería según el patrón de carrusel de la APG: estática, la mueve el usuario, sin
  avance automático, con «Foto N de M» y anclas anterior/siguiente sin JS. Ancho
  adaptable en lugar de 480 px fijos. Decide el alt de las fotos de las fuentes.
- Lista de anuncios de origen con enlaces salientes reconocibles y «(no disponible)» como
  insignia.
- Vuelta a los resultados: propón cómo conservar la búsqueda (por ejemplo, pasando los
  parámetros en property-href.ts y validándolos con Zod en la ficha) y regístralo.
```

**Objetivo.** Una ficha que se lee de un vistazo y que es honesta con lo que no está consolidado.

**Revisar.**

- Los tests de R6 de la ficha actualizados sin cambiar lo que afirman.
- La galería funciona con teclado y sin JS. `csp-image-policy.test.ts` en verde.
- Capturas a 320 y 1280 px en ambos temas.

**Notas:**

- **Ficheros:** `apps/web/src/components/property-header.tsx`,
  `apps/web/src/components/source-gallery.tsx`, `apps/web/src/components/source-list.tsx`,
  `apps/web/src/components/consolidated-field.ts`, `apps/web/src/app/properties/[listingId]/page.tsx`,
  `apps/web/src/lib/property-href.ts`.
- **Tests:** `property-header`, `source-gallery`, `source-list`, `property-detail-page`,
  `property-detail-page-static`, `consolidated-field`, `property-href`.
- **Riesgos:** R6; conservar la búsqueda sin estado en el cliente (R3).
- **Tamaño:** M.
- **Evidencia:** C8, C15, C16; hueco a.
- **Presentación decidida en D.0 (decisión 133):**
  1. Escritorio a dos columnas: galería y descripción a la izquierda; panel fijo (`sticky`, sin JS) a
     la derecha con precio, datos clave y anuncios de origen. En móvil: precio → galería → resto. El
     panel no tapa el foco (C10) ni queda cortado si no cabe en la altura de la ventana.
  2. Precio: el más económico de los activos o, sin activos, el mínimo de todos (109); la cifra con
     más peso, con cifras tabulares.
  3. Datos clave en `<dl>` con etiquetas de `search-labels.ts` (134); «No consolidado» se explica
     una vez y sin trama.
  4. Anuncios de origen en el panel, junto al precio, con nombre legible de la fuente, precio, enlace
     saliente e insignia «(no disponible)». El marcado del más económico es de D.12.
  5. Galería APG estática, «Foto N de M», anclas sin JS, proporción fija igual para todas, ancho
     fluido, `next/image`; el alt se decide aquí.
  6. Histórico (D.10): gráfico escalonado en SVG del servidor y tabla accesible, con eje constante.
  7. Ubicación (D.11): mapa estático del servidor con teselas como `<img>` y área con la trama
     siena; la excepción a R2 la registra D.11.
- **Estado (2026-10-06): D.9 hecha.** Aplicada en siete unidades de trabajo y tres lotes (SDD, Engram
  `sdd/property-detail-d9/*`), un solo PR con `size:exception` aceptado por el responsable. Commits: `a7d49ed` (orden de
  fuentes en `packages/db`), `2eee8ba` (rótulos, planta, párrafos), `3fe9c20` (enlace de vuelta), `e8d87c2` (resumen, datos clave,
  fuentes, descripción), `925d111` (galería), `a6b5eee` (disposición), `daa6af4` (capturas) y el de documentación. Decisiones 171-174.
- **Qué hay:** enlace «Volver a los resultados» con parámetros en lista blanca revalidados con Zod (171); galería con
  `scroll-snap` y anclas (172); rejilla de dos columnas con panel `sticky` desde 64rem y precio duplicado por punto de corte (173);
  datos clave en `<dl>` con «—», nota única, planta legible, nombres de fuente, «Ver en {Fuente}» e insignia «(no disponible)» (174).
- **Tests y e2e:** web 741, `detail.db` 13. `pnpm e2e update` en Docker: 368 superados y 280 omitidos; una segunda ejecución sin
  actualizar, igual. Solo cambian las seis capturas de `detail` (320, 768 y 1280 × claro y oscuro); `home`, `map` y la línea base
  de axe no cambian. Revisadas a ojo: un solo precio por ancho, enlace de vuelta sobre el h1, dos columnas con panel a 1280 y una a
  320 y 768, sin desbordamiento horizontal y legibles en ambos temas.
- **Fuera de las capturas:** la galería no sale en el e2e (la siembra no tiene miniaturas) y la semilla tiene todos los datos, así
  que «—» y la nota «No consolidado» solo los cubren los tests unitarios. *Resuelto en el seguimiento de abajo.*
- **Seguimiento de la verificación (2026-10-06, decisión 175):** la siembra añade P7, con dos anuncios `inactive` sin tombstone, dos
  fotos locales (`apps/web/e2e/assets/gallery-{1,2}.png`, copiadas a `public/e2e-fixtures/` solo en `Dockerfile.e2e`) y sin baños ni
  planta. No sale en la búsqueda (109), así que ninguna captura existente cambia. La ruta `detail-gallery` añade seis capturas y
  su entrada axe (sin violaciones). Revisadas a 320 y 1280 en ambos temas: galería con «Foto 1 de 2 · Idealista» y «Foto
  siguiente», «—» en Baños y Planta, una sola nota y un solo precio (219.000 €, el mínimo de todos). `property-detail.spec.ts`:
  sin JavaScript, «Foto siguiente»/«Foto anterior» cambian el fragmento y colocan la foto en la tira (cajas, no tiempos), nada
  avanza solo y el enlace de vuelta es un `href="/"` que funciona; con Tab, ningún enfocable queda tapado (`elementFromPoint`
  en su centro, dentro de la ventana y de la parte visible del panel) a 1280, a 1280×480 con el panel desplazándose por dentro
  y a 320. No se encontró ningún defecto. Commits `c37ea2a` y `255f416`. E2e: 400 superados y 320 omitidos (antes 368 y 280);
  web 741 y la forma de la siembra 43 (antes 41).
- **Observación:** «Disponible en N fuentes» cuenta todos los anuncios (`listing_count`), también los «(no disponible)»;
  en P7 dice «2 fuentes» con las dos no disponibles, y en P2 «2 fuentes» con una retirada. *Corregido (decisión 176):* la ficha
  cuenta las fuentes distintas con algún anuncio activo (`countActiveSources` sobre las fuentes que ya carga la página) y, sin
  ninguna, dice «No disponible en ninguna fuente». P2 dice «Disponible en 1 fuente» y P7 «No disponible en ninguna fuente», una
  vez por ancho. Solo cambian las seis capturas de `detail` y las seis de `detail-gallery`. Web 752 (antes 741); e2e 400
  superados y 320 omitidos, igual que antes. La búsqueda (`distinctSourceCount`) sigue contando fuentes de todos los anuncios: P2
  sale allí con «2 fuentes». No se ha tocado (fuera del alcance); ver la decisión 176. *Alineado después (decisión 177), con la
  aprobación del responsable:* la subconsulta `distinctSourceCount` de `search.ts` filtra por `src_l."status" = 'active'` y P2
  dice «Disponible en 1 fuente» también en los resultados. El mapa no usa ese recuento. Tests nuevos: uno de forma en
  `search.test.ts` y dos contra Postgres en `search.db.test.ts` (fuente con solo un anuncio retirado o inactivo; dos activos de
  la misma fuente), verificados en rojo. Cambian las seis capturas de `home` y las dos de `map` a 1280; `detail`,
  `home-filtered` (P2 no entra en su filtro) y `map` bajo 64rem (solo el mapa) no cambian. db 295, web 752, e2e 400 superados y
  320 omitidos.
- **Tamaño:** ~1000 líneas de código, tests y documentación sin contar las capturas; `size:exception`.

---

## [x] D.10 · Ficha: histórico de precios

```text
Paso D.10 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): muestra en la ficha el
histórico de precios de los anuncios de la vivienda.

- Consulta nueva en packages/db/src/detail.ts sobre listing_versions de todos los
  anuncios de la vivienda, ordenada por fecha y con su fuente, con tests en
  packages/db/test/detail/detail.db.test.ts. Cubre un anuncio retirado y uno redactado:
  la decisión 107 conserva los precios, así que su histórico se sigue mostrando.
- Lo que se derive (cambios, variación) va en packages/core, sin Next ni ORM.
- Presentación: primero una tabla accesible (con caption y encabezados) que funciona
  sin JS; si aporta, un gráfico SVG sencillo renderizado en el servidor. Diseña el caso
  de una sola versión.
- Comprueba que el rol de solo lectura puede leer listing_versions.
```

**Objetivo.** Hacer visible el histórico que el modelo de versiones ya guarda.

**Revisar.**

- La consulta usa el rol de solo lectura y no hace N+1.
- El caso de una sola versión y el de un anuncio retirado están diseñados.
- La tabla tiene `caption` y `th` con `scope`. Importes con `format-price`.

**Notas:**

- **Ficheros:** `packages/db/src/detail.ts`, `packages/db/src/index.ts`, `packages/core` (función
  nueva), `apps/web/src/app/properties/[listingId]/page.tsx`,
  `apps/web/src/components/price-history.tsx` (nuevo).
- **Tests:** `packages/db/test/detail/detail.db.test.ts`, `packages/db/test/detail-type-assertions.test.ts`,
  test nuevo en `packages/core`, `apps/web/test/db/readonly-role-privileges.test.ts`.
- **Riesgos:** decisión 107; `listings` frente a `properties`; rendimiento de la consulta.
- **Tamaño:** M.
- **Evidencia:** C9 (fragmento secundario sin verificar, S36).
- **Contrato de D.0 (133):** gráfico escalonado en SVG generado en el servidor y, además, la tabla
  accesible (fecha, fuente, precio y variación). Los dos, no «si aporta». Todos los anuncios sobre
  los mismos ejes (eje constante, 132).
- **Estado (2026-10-07): D.10 hecha.** Aplicada en ocho unidades de trabajo y dos lotes (SDD, Engram
  `sdd/price-history-d10/*`), un solo PR con `size:exception` aceptado por el responsable. Commits: `a0126d0` (consulta en
  `packages/db`), `b8e3bca` (derivación en `packages/core`), `6095815` (`formatUtcDate` compartido), `b830e52` (variación y geometría
  del gráfico), `2dc1645` (componente, página y CSS), `cc104ee` (histórico de P1 en la siembra), `4411d24` (región con foco y tope de
  ancho), `54c4bf3` (ruta `detail-history` y capturas) y el de documentación. Decisión 178.
- **Qué hay:** sección «Histórico de precios» fuera del panel fijo (bajo la galería desde 64rem; tras los anuncios de origen en móvil),
  con gráfico SVG escalonado del servidor (una serie por anuncio, ejes comunes, precio sin cero, trazo y marcador distintos por serie,
  `role="img"` con nombre) y tabla accesible agrupada por anuncio (Fuente, Fecha, Precio, Variación, con `caption` que dice que son
  fechas de nuestro barrido). Las versiones consecutivas de igual precio se unen; un anuncio retirado conserva su historia y la
  insignia «(no disponible)»; si nada cambió, solo la tabla y «Precio observado el dd/mm/aaaa; aún sin cambios». El rol de solo lectura
  ya leía `listing_versions` (test nuevo en `readonly-role-privileges.test.ts`).
- **Tests y e2e:** core 824, db 300 (más 1 fichero omitido), web 795 y ingestion 842 superados con `pnpm test`. `pnpm e2e:update` en Docker: 427 superados
  y 335 omitidos; una segunda ejecución sin actualizar, igual. Cambian las doce capturas de `detail` (P2) y de `detail-gallery` (P7),
  que ahora llevan la tabla de «sin cambios», y se añaden las seis de `detail-history` (P1) y su entrada en la línea base axe (sin
  violaciones). `home` y `map` no cambian. Revisadas a ojo a 320, 768 y 1280 en claro y oscuro: precio de cabecera único, la sección
  sale tras los anuncios de origen y, a 1280, bajo el título en la columna izquierda; el gráfico se lee en los dos temas (trazo
  continuo y discontinuo, círculo y cuadrado); P7 muestra el texto de «sin cambios» y ningún gráfico.
- **Desviaciones del diseño:** (1) la ruta `detail-history` sobre P1 no estaba en las tareas: `detail` es P2 y `detail-gallery` P7,
  ninguna con cambios de precio, así que sin ella el gráfico no tenía captura ni axe. (2) La tabla lleva una región con foco
  (`role="region"`, `tabindex="0"`, `overflow-x: auto`): a 320 px la de P7 sobresalía del margen unos píxeles; el diseño la reservaba
  para ese caso. (3) El gráfico tiene un ancho máximo de 24rem; sin él, los rótulos del SVG escalaban hasta unos 30 px a 1280. (4) `price-chart.ts` exporta
  además `X_LABEL_Y`, `Y_LABEL_X` y `markerPath`, que el componente necesita.
- **Observación:** la 133.6 hizo obligatorio el gráfico («si aporta» del prompt quedó superado). La especificación suponía que `detail`
  era P1; en la siembra es P2.
- **Tamaño:** ver el PR; `size:exception`.

---

## [x] D.11 · Ficha: mapa de ubicación

```text
Paso D.11 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): un mapa de ubicación
en la ficha.

- Las coordenadas pueden ser aproximadas: muestra un área, no un punto exacto, con el
  aviso «Ubicación aproximada».
- Prefiere reutilizar el envoltorio de cliente search-map.tsx con props antes que crear
  otro. Si hace falta un fichero de cliente nuevo, amplía el allowlist y registra la
  decisión (R4).
- Carga diferida (next/dynamic, ssr: false), atribución de OSM visible y alternativa
  noscript con el municipio.
```

**Objetivo.** Situar la vivienda sin sugerir una precisión que los datos no tienen.

**Revisar.**

- No se muestra un punto exacto si la coordenada es aproximada.
- Allowlist sin cambios, o ampliado con su decisión.
- Solo se piden teselas de OSM (falsas en la suite). Funciona sin JS.

**Notas:**

- **Ficheros:** `apps/web/src/app/properties/[listingId]/page.tsx`,
  `apps/web/src/components/search-map.tsx`, `apps/web/src/components/search-map-canvas.tsx`,
  `packages/db/src/detail.ts` si no devuelve ya las coordenadas.
- **Tests:** `no-client-directive`, `map-guards`, `property-detail-page`.
- **Riesgos:** coordenadas ofuscadas (escollo de `CLAUDE.md`); R4.
- **Tamaño:** M.
- **Evidencia:** C3, C14, C34.
- **Contrato de D.0 (133):** mapa estático del servidor, sin JS ni componente de cliente, con
  teselas como `<img>` nativo y el área con la trama siena; sustituye al envoltorio de cliente del
  prompt (ver desviaciones). Este paso registra la decisión que enmienda R2 (solo teselas de
  `tile.openstreetmap.org`) y ajusta `csp-image-policy.test.ts` a esa excepción y nada más. Punto
  abierto, que el responsable no ha decidido: el límite de la 112 y de `map-guards.test.ts` (SMV-9),
  que solo admite el host de teselas en `search-map-canvas.tsx`; lo resuelve este paso en su propia
  decisión. Ficheros y tests de estas notas se revisan al planificar.
- **Estado (2026-10-07): D.11 hecha.** Aplicada en siete unidades de trabajo (SDD, Engram
  `sdd/location-map-d11/*`), un solo PR con `size:exception` aceptado por el responsable. Commits: `60f07e2` (geometría de teselas
  en `packages/core`), `86c543b` (`lat`, `lon` y municipio en la cabecera), `b3ea27d` (módulo `lib/osm-tiles.ts` y SMV-9), `32bc128`
  (componente, página, CSS y guardas), `8b5ade3` (e2e), `8862cb2` (capturas) y el de documentación. Decisión 179.
- **Qué hay:** sección «Ubicación» entre el histórico y la descripción (columna izquierda desde 64rem, nueva área `location`):
  mosaico de 2×2 teselas OSM a zoom 14 como `<img>` nativo `loading="lazy"`, círculo de 500 m con trama siena y filete de
  superficie (contraste en oscuro), pie «Ubicación aproximada» y «© OpenStreetMap» enlazado, sin punto ni marca. Sin coordenadas
  conserva el título y el municipio; sin ambos no hay sección. Sin JS ni componente de cliente (R4 sin cambios).
- **Tests y e2e:** core 840, db 300 (más 1 fichero omitido, y `test:detail` 23), web 812 y ingestion 842 superados con `pnpm test`; `lint`
  y `typecheck` limpios y `next build` correcto. e2e en Docker: `property-detail.spec` con los dos casos nuevos (P1 con cuatro teselas y
  P6 sin ninguna petición) en verde; `pnpm e2e:update`: 429 superados y 345 omitidos. Cambian solo las 18 capturas de `detail`,
  `detail-gallery` y `detail-history`; `home`, `map` y la línea base axe no cambian. Revisadas a ojo a 320 y 1280 (oscuro): mapa
  claro con la trama legible en los dos temas y círculo dentro del marco.
- **Desviaciones del diseño:** ninguna de fondo. Los casos e2e se escribieron tras el componente (unidad 4) y no antes: el orden de
  las unidades ponía el e2e después de la implementación, y su verde de primera vez no demuestra por sí solo que fallarían sin ella.
- **Seguimiento (verificación):** `map-guards` fija ahora sobre `components/property-location.tsx` el import de `osmTileUrl` desde
  `@/lib/osm-tiles`, el literal de atribución con su enlace exacto y la ausencia de `fetch(` e `innerHTML`; el fichero queda fuera de
  `MAP_FILES` para no tocar SMV-22. Rojo demostrado mutando el fuente (import, atribución, enlace, `fetch`, `innerHTML`).
- **Observación:** el radio de 500 m es provisional y choca con la 133 («se fija con datos reales»); la 179 lo registra como conflicto.
  `apps/web` consume `packages/*` compilados: tras tocar `core` o `db` hay que reconstruirlos antes de `typecheck` y de los tests.

---

## [x] D.12 · Ficha: comparación de fuentes

```text
Paso D.12 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): convierte la lista de
anuncios de origen en una comparación.

- Para cada anuncio: fuente, precio, última vez visto, número de fotos y estado.
- Destaca el más económico de los anuncios activos (decisión 109), calculado en
  packages/core, con empates resueltos de forma explícita. Si no hay ninguno activo,
  muestra el mínimo de todos con un aviso.
- El texto distingue «anuncio» de «vivienda» y no presenta la agrupación como una
  certeza: la prioridad del proyecto es evitar falsos positivos.
```

**Objetivo.** Que el usuario vea por qué se muestra un precio y dónde está cada anuncio.

**Revisar.**

- El destacado cumple la 109, con empates y sin anuncios activos.
- `no-single-source-branch.test.ts` en verde. Capturas con una y con varias fuentes.

**Notas:**

- **Ficheros:** `apps/web/src/components/source-list.tsx`, `packages/db/src/detail.ts`
  (`getPropertySources`), `packages/core` (función nueva).
- **Tests:** `source-list`, `no-single-source-branch`, `packages/db/test/detail/detail.db.test.ts`.
- **Riesgos:** decisión 109; `listings` frente a `properties`.
- **Tamaño:** M.
- **Evidencia:** ninguna afirmación directa. La investigación no encontró fuentes primarias sobre
  fichas con varias fuentes (hueco a).
- **Contrato de D.0 (133):** desde D.9, la lista ya va junto al precio; este paso añade la
  comparación y marca el más económico de los activos.
- **Estado (2026-10-07): D.12 hecha.** Aplicada en seis unidades de trabajo (SDD, Engram `sdd/source-comparison-d12/*`), un solo PR
  con `size:exception` aceptado por el responsable. Commits: `f813214` (`compareSourceListings` en `packages/core`), `a49a4ad`
  (componente y CSS), `7d54387` (test de consistencia con `min_price_cents`), `4d20c26` (e2e), `923478e` (capturas) y el de
  documentación. Decisión 180.
- **Qué hay:** cada anuncio es una fila con enlace, insignia y lista de datos con etiqueta (Precio, Fotos, Visto por última vez,
  Estado; fotos sin dato = «Sin datos»). «Más económico» marca todos los anuncios activos empatados al precio mínimo; sin ninguno
  activo, aviso y «Precio más bajo». Nota fija bajo el título: la agrupación es una estimación. La decide `compareSourceListings`
  (core), no el número de fuentes.
- **Tests y e2e:** core 854, web 830 y db 300 (`test:detail` 24) superados; `typecheck` y `lint` limpios. e2e en Docker: antes de las
  capturas, 435 superados, 375 omitidos y 24 fallos solo visuales (18 cambiadas y 6 nuevas); `pnpm e2e:update`: 459 superados y 375
  omitidos, y una segunda pasada sin `update` igual (459/375). Casos nuevos de `property-detail.spec` (P4 una insignia y nota, P7 aviso
  y «Precio más bajo», sin desbordamiento horizontal a 320 px) y axe de la ruta nueva `detail-single` en verde.
- **Capturas:** cambian 18 (`detail`, `detail-gallery`, `detail-history`, seis anchos y temas) y se añaden 6 de `detail-single`;
  `home`, `map` y el resto no cambian. Revisadas a ojo a 320 y 1280 en claro y oscuro (muestra de cada ruta): una insignia, nota
  visible, aviso solo en P7, sin desbordamiento y regla de 3 px legible (sustituida después por el panel de 1px; ver abajo).
- **Observación:** a 1280 px el panel lateral de P7 (sticky, con tope de altura) se desplaza por dentro y recorta la segunda fila de
  la lista en la captura. Es el comportamiento de D.9, pero ahora la lista es más alta.
- **Tamaño:** ~627 líneas de código, tests y e2e desde `c0f201c` (sin documentación ni las 24 capturas).
- **Corrección (2026-10-08, decisión 182):** el detector de impeccable marcó `side-tab` en la regla lateral de 3 px del aviso
  (`.source-list__warning`); el suelo de oficio la prohíbe. El aviso pasa al panel de 1px de D.7 (borde `--rule`, mismo relleno y
  radio, regla compartida con `.nl-review__alert` y `.nl-issues`). Commits `58f4ec5` (CSS) y `1dd2174` (capturas: cambian las seis
  de `detail-gallery`, P7).

---

# Bloque 5 — Estados

## [x] D.13 · Avisos de cobertura

```text
Paso D.13 de docs/DESIGN-ROADMAP.md. Usa `impeccable clarify`.

- Un componente de aviso con variantes para los cuatro mensajes de cobertura (zona no
  barrible, tope agotado, tope del cliente agotado, solicitud registrada) y el estado
  del trabajo. role=status para el progreso; role=alert solo para lo que exige atención.
- Fechas en hora local con Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' })
  en lugar de ISO; «00:00 UTC» pasa a hora local.
- Estado de progreso mientras llegan resultados, y se conserva el enlace de recarga
  sin JS.
- CoverageStatus (coverage-status.tsx) sigue siendo el único cliente de este flujo.
```

**Objetivo.** Que el usuario entienda qué pasa con una zona sin cobertura y cuándo volver.

**Revisar.**

- Ningún fichero de cliente nuevo. `aria-live` no se duplica.
- Una captura por variante: la siembra de D.1 necesita un `coverage_job` en cada estado.

**Notas:**

- **Ficheros:** `apps/web/src/components/coverage-status.tsx`,
  `apps/web/src/components/coverage-status-policy.ts`, `apps/web/src/app/page.tsx`, componente de
  aviso (nuevo).
- **Tests:** `coverage-status-policy`, `coverage-status-no-write-import`,
  `db/page-coverage-degradation`.
- **Riesgos:** el sondeo del cliente; la zona horaria del servidor.
- **Tamaño:** S-M.
- **Evidencia:** C13.
- **Registro (134):** tuteo; fechas legibles en español en lugar de ISO.
- **Estado (2026-10-08): D.13 hecha.** Aplicada en siete unidades de trabajo (SDD, Engram `sdd/coverage-notices-d13/*`), un solo PR
  con `size:exception` aceptado por el responsable. Commits: `e02cebc` (módulo de hora de Madrid), `47a03b5` (`CoverageNotice` y CSS),
  `55440b5` (página y `CoverageStatus`), `dc8c562` (siembra), `801273e` (rutas e2e), `9e17bd6` (capturas) y el de documentación.
  Decisión 181.
- **Qué hay:** `CoverageNotice` (servidor) pinta las 10 variantes (V1-V10; no hay una undécima) con título y detalle en tuteo,
  «actualización de la zona» en lugar de «barrido», sin ISO ni «UTC» y sin `job.error`. `role="alert"` solo en `failed`; el resto,
  `status`, con `aria-atomic="true"` y sin `aria-live` en `CoverageStatus`, que ahora solo explica el refresco («cada 5 segundos
  durante 2 minutos» y después el enlace). El reinicio del tope sale en hora de Madrid sin palabra de día («a partir de las 2:00 de la
  madrugada»). El enlace «Comprobar de nuevo» (un `<a>` plano) solo aparece con solicitud registrada y los cuatro estados de job.
  Una solicitud registrada sin job ya no se pinta como nada: es la variante V4.
- **Tests y e2e:** web 905 y db 310 (1 omitido) superados; `typecheck` y `lint` limpios.
  e2e en Docker: `pnpm e2e:update` 621 superados y 465 omitidos; dos pasadas seguidas de `pnpm e2e` iguales (621/465). Las 36 capturas
  nuevas (6 rutas `coverage-*` por 6 proyectos) no cambian ninguna de las anteriores; el axe de las 6 rutas nuevas da cero
  infracciones. La hora de reinicio se enmascara en las capturas.
- **Capturas:** revisadas a ojo `coverage-failed` a 320 px en claro (regla roja de 3 px, después panel de 1px; título, detalle, enlace) y `coverage-cap` a
  1280 px en oscuro (hora enmascarada, sin desbordamiento).
- **Observación:** con la zona sin cubrir la página sigue enseñando todos los resultados sin filtro geográfico bajo el aviso («Todavía
  no hay viviendas de Pinto» junto a «5 resultados»). Es el comportamiento heredado de 1.13 (degradación honesta); el aviso lo
  explica poco. Queda para D.14 o un paso propio.
- **Tamaño:** 1148 líneas añadidas y 125 borradas en código, tests y e2e (sin documentación, capturas ni `axe-baseline.json`), frente
  a ~870 previstas: el componente (191) y sus tests (246) salieron más largos que en el diseño.
- **Corrección (2026-10-08, decisión 182):** la regla de 3 px se copió a propósito del aviso de D.12 y el detector de impeccable la
  marcó como `side-tab`. El aviso pasa al panel de 1px de D.7 (borde `--rule`; `role="alert"` con borde `--danger`), sin `ignore`.
  `impeccable detect` sobre `globals.css` queda sin hallazgos. Web 909 superados; `typecheck` y `lint` limpios; `pnpm e2e:update` y
  `pnpm e2e` 621 superados y 465 omitidos. Cambian 42 capturas: las 36 `coverage-*` y las 6 de `detail-gallery`; `axe-baseline.json`
  no cambia. Revisadas a ojo `coverage-failed` a 320 px en claro (borde rojo de 1px), `coverage-cap` a 320 px en oscuro y
  `detail-gallery` a 320 px en claro. Commits `58f4ec5` (CSS) y `1dd2174` (capturas).

---

## [x] D.13b · Correcciones de la auditoría del suelo de oficio

```text
Paso D.13b de docs/DESIGN-ROADMAP.md. Carga impeccable y lee reference/craft-floor.md
antes de editar UI, en el diseño y en la aplicación. Corrige los hallazgos de la
auditoría de D.0-D.13 (notas de este paso), en este orden:

- Capa base de controles: un relleno común para input, select y button en
  @layer base, sin rellenos sueltos por sitio; hover (solo con hover:hover y
  pointer:fine) y :active; caret-color, accent-color y scrollbar-color desde los tokens.
- Iconos dibujados: cerrar, enlace externo, más y menos como SVG en línea con
  currentColor y un solo grosor de trazo, también en los controles de zoom de Leaflet.
- Ficha: sin recuadro dentro del panel fijo; «Ubicación» en el tamaño de sección;
  tabular-nums en fechas comparables; la tabla del histórico sin desbordar a 320 px;
  la etiqueta del gráfico no baja de --text-small; y el panel fijo deja de esconder
  la comparación de anuncios.
- Cabecera de la búsqueda: separación entre grupos; chips de filtros visibles a
  320 px; el aviso de cobertura en la columna de la lista.
- Texto: tuteo o primera persona del plural en los avisos de cobertura que siguen en
  impersonal; el pie con una medida de 65-75 caracteres.
```

**Objetivo.** Que lo construido en D.0-D.13 cumpla el suelo de oficio de impeccable antes de seguir construyendo encima.

**Revisar.**

- `impeccable detect` sigue sin hallazgos y axe sin infracciones nuevas.
- Una pasada a ojo por las capturas regeneradas: ningún texto pegado a un borde, ningún recuadro anidado, ningún carácter como icono.
- El panel fijo de la ficha (hallazgo 5) toca la decisión 133: lo decide el responsable antes del diseño.

**Notas:**

- **Origen:** auditoría del 2026-10-08 (Engram `design/craft-floor-audit-d0-d13`), hecha porque solo D.3 había cargado
  `craft-floor.md`. El detector y axe no encuentran nada; los 14 hallazgos salen del CSS y de las capturas.
- **Hallazgos importantes:** (1) controles sin relleno base (`globals.css`, `@layer base`); (2) el aviso de D.12 es un recuadro dentro
  del panel fijo a partir de 64rem, consecuencia de la decisión 182; (3) ×, ↗ y los +/− y × de Leaflet como iconos; (4) sin hover ni
  `:active` en botones, el resumen de la bandeja, el envío y el selector de tema; (5) el panel fijo (`max-block-size` con scroll propio)
  corta la comparación de anuncios a 1280 px; (6) sin separación entre los grupos de la cabecera de búsqueda; (7) el `h2` de
  «Ubicación» (D.11) hereda el tamaño de título.
- **Hallazgos menores:** (8) superficies del navegador por defecto; (9) `tabular-nums` en las fechas del histórico y en «Visto por
  última vez»; (10) la tabla del histórico desborda a 320 px; (11) chips ocultos en un scroll horizontal a 320 px; (12) la etiqueta del
  gráfico sale a ~10.8 px a 320 px; (13) «Se ha alcanzado…» y «Se volverá a intentar…» en `coverage-notice.tsx`; (14) el pie a ~180
  caracteres por línea y el aviso de cobertura más ancho que la lista.
- **No se tocan (contrato):** fuente del sistema (132, 141), precio protagonista y pasos numerados (157). Movimiento en D.16; 404 y
  estado vacío en D.14.
- **Capturas:** la capa base de controles cambia todas las rutas en los seis proyectos.
- **Tamaño:** M-L.
- **Estado (2026-10-08): D.13b hecha.** Aplicada en siete unidades más una corrección (SDD, Engram `sdd/craft-floor-fixes-d13b/*`), un
  solo PR con `size:exception` aceptado por el responsable. Commits: `fc012ba` (controles base y hover), `b998e4a` (iconos), `af484a9`
  (ficha), `19853a6` (cabecera), `a4b0b07` (tope de reintentos y copy), `234158b` (histórico apilado), `f5f20ca` (capturas) y el de
  documentación. Decisiones 183, 184 y 185.
- **Qué hay:** relleno base `.5rem .75rem` para input, select y button; hover solo con puntero fino y `:active`; `caret-color`,
  `accent-color` y `scrollbar-color` con tokens; `components/icon.tsx` (cerrar, enlace externo, más, menos) también en el zoom y el
  cierre del popup de Leaflet; solo el resumen de precio es fijo en la ficha desde 64rem, con reserva de foco (WCAG 2.4.11) y el
  recuadro anidado fuera; «Ubicación» en la escala de sección; gráfico a 288 de ancho; histórico apilado bajo 30rem; `.search-header`
  con ritmo, chips que envuelven y aviso a 48rem; `COVERAGE_JOB_MAX_ATTEMPTS` en core y aviso de job fallido según los intentos (sin
  enlace cuando ya no hay reintentos); copy en primera persona; pie con `max-w-prose`.
- **Tests y comprobaciones:** web 957, core 859, ingestion 847 y db 310 (1 fichero omitido) superados; `typecheck` y `lint` limpios;
  `impeccable detect apps/web/src` sin hallazgos y sin `ignore`. e2e en Docker: `pnpm e2e:update` y `pnpm e2e` 630 superados y 510
  omitidos. Cambian 98 capturas (17 rutas por 6 proyectos, menos las que no varían); `axe-baseline.json` no cambia.
- **Capturas revisadas a ojo:** `detail-gallery` a 320 px en claro (histórico apilado, iconos, sin desbordamiento), `home-filtered` a
  320 px en oscuro (los nueve chips envuelven), `detail-history` a 1280 px en claro (etiquetas del gráfico, precio fijo con filete) y
  `coverage-failed` a 1280 px en oscuro (variante agotada, sin enlace, aviso a 48rem, zoom con iconos).
- **Ronda correctiva (2026-10-08):** el validador echó en falta el e2e de Leaflet que pedía el diseño: `search-map.spec.ts` comprueba ahora el svg
  en el zoom y en el cierre del popup (nombre «Cerrar», cierra y lo conserva al reabrir), y los valores del histórico apilado, también el de
  «Fuente», quedan alineados al final. Cambian 4 capturas (`detail` y `detail-gallery` a 320 px); e2e 632 superados y 520 omitidos.
- **Tamaño real:** 1086 líneas añadidas y 172 borradas en código, tests y e2e (previstas ~805), sin documentación, las 98 capturas ni
  `axe-baseline.json`.

## [x] D.14 · Estados globales: carga, error, 404, vacío y 429

```text
Paso D.14 de docs/DESIGN-ROADMAP.md. Usa `impeccable harden` e `impeccable onboard` para
el estado vacío.

- loading.tsx en / y en la ficha, con esqueletos hechos con tokens, compatible con la
  lectura de la cookie decidida en D.4. En la ficha, notFound() se llama antes de
  cualquier await que suspenda, porque un 404 en streaming responde 200.
- error.tsx en la raíz (y en la ficha si aporta). Es un componente de cliente:
  amplía el allowlist de no-client-directive.test.ts y registra la decisión.
- not-found.tsx en la raíz y en la ficha, con salida hacia la búsqueda.
- global-error.tsx con su propio <html> y <body>, sin metadatos y sin la clase de tema:
  estilos mínimos que siguen prefers-color-scheme. También es de cliente (allowlist).
- Resultados vacíos con orientación sobre qué cambiar.
- 429: proxy.ts devuelve hoy texto plano «Too Many Requests»; una página mínima en
  español que conserva el estado 429 y sus cabeceras.
```

**Objetivo.** Que ningún estado deje al usuario ante una pantalla en blanco o un texto técnico.

**Revisar.**

- El allowlist crece solo con los ficheros de error, con su decisión.
- El fallback de carga se ve (con un retraso artificial en la suite de D.1).
- Una ficha inexistente responde 404. `global-error` se ve bien en ambos temas.
- La respuesta 429 conserva su estado y sus cabeceras.

**Notas:**

- **Ficheros (nuevos):** `apps/web/src/app/loading.tsx`, `apps/web/src/app/error.tsx`,
  `apps/web/src/app/not-found.tsx`, `apps/web/src/app/global-error.tsx`,
  `apps/web/src/app/properties/[listingId]/loading.tsx` y `not-found.tsx`. **Modificados:**
  `apps/web/src/proxy.ts`, `apps/web/src/app/page.tsx`.
- **Tests:** `no-client-directive` (enmienda), `proxy-rate-limit`, `property-detail-page`.
- **Riesgos:** C20 (resuelto en D.4), C24, R4.
- **Tamaño:** M.
- **Evidencia:** C13, C20, C24, C28, C29, C30.
- **Registro (134):** estados vacíos y error de parámetros en tuteo.
- **Hecho (2026-10-09):** aplicada con SDD en nueve unidades (Engram `sdd/global-states-d14/*`), un solo PR con `size:exception`
  aceptado por el responsable. Decisiones 186-192. Commits: `89db423` (cargador compartido y 404 en el layout de la ficha),
  `c8870fb` (grupo `(search)`), `190bfee` (not-found, error, global-error, CSS autónomo), `2364480` (correcciones de copy), `3dc3d9a`
  (estado vacío), `47bd9d2` (parámetros inválidos), `bf42304` (429), `3c84560` (e2e), `d45c966` (capturas) y el de documentación.
- **Qué hay:** `app/not-found.tsx`, `app/error.tsx` y `app/global-error.tsx` (los dos últimos de cliente; lista de
  `no-client-directive` en cuatro, decisión 186); `src/lib/standalone-page.ts` con el CSS autónomo; `app/properties/[listingId]/layout.tsx`
  y `src/server/property-header.ts` (404 antes de transmitir, decisión 187); la home en `app/(search)/page.tsx` (188);
  `src/server/rate-limit-page.ts` usado por `proxy.ts` (189); `components/empty-results.tsx` con tres tipos, `src/lib/empty-results.ts` y
  la opción `keep` de `buildClearFiltersHref` (190); mensajes de core en español (`param-messages.ts`) y rótulos en
  `src/lib/search-labels.ts` (192).
- **Tests y comprobaciones:** core 920, db 310, ingestion 847 y web 1052 superados; `typecheck` y `lint` limpios; `impeccable detect
  apps/web/src` sin hallazgos. e2e en Docker: `pnpm e2e:update` y `pnpm e2e` 641 superados y 565 omitidos (nuevos:
  `global-states.spec.ts` con 404 de URL, ficha inexistente y malformada, 200 de la existente y contraste AA de la 429 en claro y oscuro;
  `rate-limit.spec.ts` contra un segundo `webServer` en el puerto 3101). Cambian 18 capturas (`not-found-route`, `not-found-property` y
  `home-filtered` por seis proyectos); `axe-baseline.json` no cambia.
- **Playwright 1.63.0** arranca las entradas de `webServer` en orden: la primera construye `.next` y la segunda solo lo sirve.
- **Tamaño real:** unas 1400 líneas entre código, tests y e2e, sin documentación ni capturas.

---

# Bloque 6 — Pasadas transversales

## [x] D.15 · Accesibilidad WCAG 2.2 AA

```text
Paso D.15 de docs/DESIGN-ROADMAP.md. Usa `impeccable audit`, `impeccable harden` e
`impeccable adapt`.

- axe con wcag22aa sin violaciones en todas las rutas, anchos y temas de la suite de D.1.
- Lista de comprobación manual, anotada en las notas: recorrido completo con teclado;
  pasada breve con lector de pantalla; zoom al 200 % y reflujo a 320 px; foco no tapado
  por la cabecera fija (2.4.11); objetivos de 24 px (2.5.8); dibujo sin arrastre
  (2.5.7); mensajes de estado (4.1.3); mapa y galería.
- Decide si se incorpora eslint-plugin-jsx-a11y, aplazado en la decisión 011.
- Un solo lote de correcciones.
```

**Objetivo.** Cumplir WCAG 2.2 AA con pruebas automáticas y manuales.

**Revisar.**

- axe a cero violaciones.
- La lista manual está completa, con el resultado de cada punto.

**Notas:**

- **Ficheros:** los componentes que salgan de la auditoría; `apps/web/eslint.config.mjs` si se añade
  el plugin.
- **Tests:** según hallazgos.
- **Riesgos:** que la auditoría abra trabajo por encima de R9: si pasa, partir el paso.
- **Tamaño:** M.
- **Evidencia:** C10, C11, C12, C13, C14, C15, C38.
- **Estado (2026-10-09): D.15 hecho.** Parte automática verificada y lista manual con 13 de 13 puntos aprobados por el responsable
  (los puntos 11 y 13 fallaron en la primera pasada y se corrigieron dentro del paso). Aplicada con SDD en diez unidades de trabajo y tres lotes (Engram `sdd/a11y-wcag22-d15/*`),
  un solo PR con `size:exception` aceptado por el responsable. Decisiones 193-202. Commits: `cfa08d0` (puerta de lint), `5f8301b`
  (`.icon` única, atribución en español y tema activo), `9de2b22` (encabezado del resultado), `247f747` (galería), `ec63a62`
  (campos rechazados), `c7c023e` (región de mapa y dirección que no recorta), `89dba4c` (axe en estados dinámicos y objetivo del
  conmutador), `d3def5a` (capturas) y el de documentación. Correcciones tras la lista manual (decisiones 203 y 204): `0bd0094` (foco
  al título de `error.tsx` y `global-error.tsx`), `810fa58` (pista «solo cifras»), `3910193` (puente de prueba dentro de un renderizado
  real, porque los componentes ya usan ganchos), `8053ac6` (24 capturas) y el de documentación.
- **Qué hay:**
  - `eslint-plugin-jsx-a11y` 6.10.2, `recommended` en `error` sobre `src/**/*.tsx` (decisión 193). Carga en ESLint 10.9.1, así que no
    hizo falta el plan B de seis reglas. Siete desactivaciones por línea justificadas, todas en `price-history.tsx`.
  - F1 y F8, galería: las diapositivas aceptan foco programático y los enlaces miden 40 px (200). F2, mapa: región con nombre y
    ayuda de teclado visible enlazada con `aria-describedby` (194). F3, tema activo anunciado con texto alternativo CSS (195). F4,
    campos rechazados con `aria-invalid` y descripción de error (196). F5, la dirección del resultado ya no se recorta (197). F6,
    encabezado del resultado con tipo y operación (198). F7, atribución solo en español (199). F10, regla `.icon` única.
  - `e2e/a11y-states.spec.ts` (nuevo, decisión 201): axe con `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa` y violaciones
    igual a `[]` (sin línea base ni capturas) en bandeja abierta a 320 y 768, parámetros inválidos, `?q=` vacío y con zona a elegir,
    `?zoneQuery=`, página 2, ventana emergente del mapa, `error.tsx`, 429 y `global-error` en claro y oscuro. Más la prueba de tamaño
    de objetivo de «Ver mapa» y «Ver lista» (decisión 202).
- **Tests y comprobaciones:** web 82 ficheros y 1082 tests superados; `typecheck` y `lint` limpios. e2e en Docker: 716 superados, 0
  fallidos (616 omitidos por las guardas de proyecto). La suite axe de D.1 no da ninguna violación y `axe-baseline.json` no cambia
  (sigue vacío). Todos los estados dinámicos pasaron axe a la primera, sin correcciones de código por axe.
- **Capturas:** 62 PNG regenerados en Docker (decisión 138), todos por causas esperadas: (a) párrafo de ayuda del mapa en todas las
  rutas de búsqueda a 1280 y en `map` a 320 y 768, y marco de `draw-frame` más bajo a 1280; (b) dirección que ahora se parte en las
  rutas de lista a 320; (c) enlaces de la galería de 40 px en `detail-gallery`; (d) conmutador «Ver mapa/Ver lista» de 40 px a 320 y
  768, que no estaba en la lista del diseño (ver desviaciones). No cambian `nl-query`, `detail`, `detail-history`, `detail-single`,
  `not-found-*` ni `draw-frame` a 320.
- **Correcciones tras la lista manual (Narrador):** el punto 11 (F12) falló porque `error.tsx` no gestionaba el foco: ahora el título
  lo recibe al montarse y `main#contenido` lo recupera tras un reintento si se perdió (203; `global-error` solo al montarse). El
  punto 13 (F4) falló porque nada decía que los campos numéricos solo admiten cifras: pista única visible enlazada con
  `aria-describedby` (204). Web 83 ficheros y 1102 tests; e2e en Docker 716 superados tras regenerar 24 PNG (bandeja abierta a 1280 en
  10 rutas por 2 temas y `nl-query` en 3 anchos por 2 temas); `axe-baseline.json` sigue vacío. El responsable volvió a comprobar los
  dos puntos con el Narrador: aprobados.
- **Tamaño real:** 934 líneas (872 añadidas, 62 borradas) en 30 ficheros de código, tests y lockfile, sin documentación ni PNG;
  previstas ~700 antes del lockfile.
- **Hallazgos para la memoria:** axe a cero no implica cumplir 2.5.8: el conmutador medía 20 px de alto y solo la prueba de caja lo
  detectó. La lista manual sigue haciendo falta (C38).

**Lista de comprobación manual** (la ejecuta el responsable; resultado: **13 de 13 aprobados**, los puntos 11 y 13 tras las
correcciones de las decisiones 203 y 204). «Evidencia automática»
enumera lo que ya cubren los tests, que no sustituye a la comprobación humana. Lector de pantalla: Narrador de Windows en Chrome
(NVDA no se pudo instalar en la máquina del responsable; ver desviaciones).

| # | Criterio | Procedimiento | Evidencia automática | Narrador (Chrome) | Notas |
| - | -------- | ------------- | -------------------- | ------------------ | ----- |
| 1 | Recorrido completo con teclado | Solo Tab, Mays+Tab, Intro, Espacio y flechas: home, filtros, bandeja, resultados, paginación, mapa (con y sin dibujar), ficha y galería; orden lógico, foco siempre visible y sin trampas | `a11y-states` y `filter-tray` cubren la bandeja; D.8b cubre el teclado del mapa | aprobado | No he detectado nignún problema |
| 2 | Pasada breve con lector de pantalla | Narrador: encabezados, regiones, enlaces y formularios en home, mapa y ficha; nombres y estados coherentes | Landmarks y `h1` únicos (`landmarks.spec.ts`); h2 con tipo y operación | aprobado | No he detectado nignún problema |
| 3 | Zoom al 200 % (1.4.4) | Ampliar al 200 % solo el texto y también la página; nada se recorta ni se solapa | Prueba de espaciado de texto (1.4.12) en `a11y-states` sobre `.map-price` y `.result-row__address` | aprobado | Todo se visualiza correctamente |
| 4 | Reflujo a 320 px (1.4.10) | Ventana de 320 px de ancho CSS, sin desplazamiento horizontal salvo tabla del histórico y mapa | `landmarks.spec.ts` (sin desbordamiento en todas las rutas) y axe a 320 | aprobado | Ventana a 320px sin scroll lateral salvo la interacción con el mapa |
| 5 | Foco no tapado (2.4.11) | Tabular por la ficha con la cabecera fija y el precio fijo; ningún foco queda oculto | `property-detail.spec.ts` (foco no tapado, ventana baja 1280x480) | aprobado | Todo bien |
| 6 | Objetivos de 24 px (2.5.8) | Revisar enlaces y botones de cada ruta, incluidos «Ver mapa», «Ver lista» y la galería | Cajas de «Ver mapa/Ver lista» y de los enlaces de galería (`a11y-states`, `property-detail`); botones del dibujo (D.8b); axe `target-size` | aprobado | Todo funciona bien |
| 7 | Dibujo sin arrastre (2.5.7) | Dibujar una zona solo con teclado y, con ratón, sin arrastrar | Pruebas e2e de D.8b (dibujo por teclado, mira, botones de 24 px) | aprobado | Funciona bien |
| 8 | Mensajes de estado (4.1.3) | Alertas de parámetros inválidos, «resultados», error de bandeja y aviso de cobertura anunciados sin mover el foco | axe en los estados con alerta (`a11y-states`) | aprobado | F11: el `role="status"` del aviso de cobertura se renderiza en el servidor y puede no anunciarse al cargar; comprobar también el refresco acotado. Limitación documentada, solo se registra. Todo bien |
| 9 | Mapa: teclado y ayuda | Tab hasta la región «Mapa interactivo»; el Narrador lee su nombre y la descripción con el texto de ayuda; flechas y +/- mueven y amplían | Región con nombre, `tabindex` 0 y descripción accesible (`search-map.spec.ts`) | aprobado | F2. F9: hasta 500 paradas de tabulación en marcadores (`MAP_POINT_CAP`); solo se registra la molestia, no se corrige en D.15. Lo que yo he revisado funciona bien |
| 10 | Galería: foco | Foto siguiente/anterior con Intro: el foco pasa a la diapositiva destino y el Narrador la lee | Diapositivas con `tabindex="-1"` (unitario) y `document.activeElement` (`property-detail.spec.ts`) | aprobado | F1. |
| 11 | Foco tras error o reintento | Provocar `error.tsx` y «Reintentar»; el foco acaba en un lugar sensato y el cambio se anuncia | axe sobre `error.tsx` y `global-error` (`a11y-states`) | aprobado | F12. Al recargar aparece la pantalla de error pero el narrador no describe que ha pasado y no se sitúa el foco en el botón de reintentar. Corregido en `0bd0094` (decisión 203); el responsable lo volvió a comprobar con el Narrador y queda aprobado |
| 12 | Tema activo anunciado | En el selector de tema, el Narrador dice «Sistema, activo» (o el tema vigente) y los demás sin «activo» | `theme.spec.ts` (nombre accesible con y sin cookie) | aprobado | F3, decisión 195. Funciona bien |
| 13 | Campos rechazados | Con `?minPrice=abc`, el Narrador anuncia «no válido» y la descripción del error en el campo | Pruebas unitarias de `aria-invalid` y `aria-describedby`; axe en el estado inválido | aprobado | F4. El narrador deletrea lo que tecleo pero nunca indica que en ese campo no se pueden escribir carácteres que no sean numéricos. Corregido en `810fa58` (decisión 204); el responsable lo volvió a comprobar con el Narrador y queda aprobado |

Al volver los resultados: se rellenan las celdas con aprobado, fallado o notas, se corrigen o desvían los fallos y se cierra el paso.

---

## [x] D.16 · Movimiento

```text
Paso D.16 de docs/DESIGN-ROADMAP.md. Usa las skills emil-design-eng y animate (o
`impeccable animate`). Movimiento sobrio: es una herramienta de uso frecuente.

- Solo CSS, sin bibliotecas de animación. Tokens de duración en globals.css: unos 100 ms
  para respuesta, 200-300 ms para paneles y la bandeja, nunca más de 400 ms. ease-out al
  entrar y ease-in al salir. Solo transform y opacity.
- @starting-style para la bandeja y los <details>.
- prefers-reduced-motion quita todo movimiento no esencial.
- Nada se anima en respuesta a acciones de teclado repetidas.
- Transiciones de vista: evalúalas solo si no exigen un componente de cliente ni un flag
  experimental en Next 16.3.4 (compruébalo en node_modules/next/dist/docs). Las
  transiciones entre documentos no funcionan en Firefox.
```

**Objetivo.** Movimiento que explica cambios de estado, sin decorar ni retrasar.

**Revisar.**

- Con movimiento reducido, las capturas coinciden con las estáticas.
- Ninguna duración supera 400 ms, y todas salen de tokens.
- La suite de D.1 sigue estable.

**Notas:**

- **Ficheros:** `apps/web/src/app/globals.css` y los componentes animados.
- **Tests:** ninguno nuevo previsto.
- **Riesgos:** inestabilidad de las capturas; R4 si alguna transición pidiera JS.
- **Tamaño:** S-M.
- **Evidencia:** C33, C39, C40, C41, C42, C43.
- **Estado (2026-10-13): D.16 hecho.** Aplicada con SDD (Engram `sdd/motion-d16/*`) en cinco commits de un solo PR con `size:exception`
  aceptado por el responsable: `b0f4837` (tokens y transiciones CSS), `20cd3fd` (parche de teclado de Leaflet), `6b5bd3a` (opciones del
  mapa), `ec537ff` (espec e2e de movimiento) y el de documentación. Decisiones 205-208. Sin capturas nuevas ni regeneradas: las de la
  suite de D.1 salen idénticas con movimiento reducido.
- **Qué se hizo:** cinco tokens en `@theme static` (100/250/200 ms y dos curvas); la bandeja funde por debajo de 64rem con
  `::details-content` (opacidad, `translateY(-0.5rem)` y `content-visibility` con `allow-discrete`) dentro del `@supports` existente;
  pulsación `scale(0.97)` solo con puntero; movimiento reducido pone los tres tiempos a `0s`; Leaflet siempre sin animaciones y con el
  teclado instantáneo.
- **Sonda de `::details-content`:** `getComputedStyle(el, '::details-content')` resuelve el pseudoelemento en Chromium (se leen opacidad,
  transformación y propiedades de transición), así que la bandeja se prueba con estilo calculado y estados finales, nunca con
  `getAnimations()` (no lista esas transiciones). El build minimiza `100ms` a `.1s`: el espec compara milisegundos.
- **Cómo se demostró el rojo del e2e:** el espec se escribió después de la implementación; para ver que falla de verdad se restauró
  temporalmente `globals.css`, el lienzo y la capa de clústeres al estado previo al paso (`git checkout e8236f2 -- …`), se ejecutó en
  Docker (6 fallos de 10: tokens vacíos, sin transición en la pulsación, `transition-property: all` y pan animado) y se volvió a `HEAD`
  sin dejar cambios.
- **Verificación:** vitest de `apps/web` 84 ficheros y 1.162 tests (antes 83 y 1.102); `tsc` y `eslint` limpios; suite Docker completa
  sin capturas modificadas ni regeneradas.
- **Pendiente conocido:** la inercia del arrastre, el `autoPan` del popup y `fitBounds` de Leaflet no se
  tocan a propósito (decisión 206). Safari/WebKit corta la salida de la bandeja (se queda en el estado cerrado sin fundido) y Firefox no
  marca `:active` con Espacio: ambos se comprobaron en la investigación y se aceptan como degradación.

---

## [ ] D.17 · Pulido final y DESIGN.md

```text
Paso D.17 de docs/DESIGN-ROADMAP.md. Usa `impeccable critique`, `impeccable polish` e
`impeccable document`.

- Crítica y pulido de todas las pantallas a los tres anchos y en ambos temas, con un
  solo lote de correcciones.
- DESIGN.md en la raíz, derivado del código entregado (tokens reales de globals.css y
  componentes), no de intenciones.
- Elimina estilos y tokens sin uso.
- Regenera en Docker las capturas de referencia finales y revisa su diferencia una a una.
- Actualiza la sección «Capa web» de docs/ARCHITECTURE.md si ha cambiado algo
  estructural.
```

**Objetivo.** Cerrar el diseño con un sistema documentado y unas capturas de referencia fiables.

**Revisar.**

- `DESIGN.md` coincide con los tokens de `globals.css`.
- Todos los tests en verde, axe a cero y las capturas finales revisadas.

**Notas:**

- **Ficheros:** `DESIGN.md` (nuevo), `apps/web/src/app/globals.css`, capturas de `apps/web/e2e/`,
  `docs/ARCHITECTURE.md`.
- **Tests:** la suite de D.1.
- **Riesgos:** que el pulido se convierta en un rediseño; limitarlo a un lote.
- **Tamaño:** S-M.
- **Evidencia:** C36, C37.

---

# Evidencia de la investigación

Resumen de la investigación del cambio `web-ux-ui-design-roadmap` (Engram, revisión 2, consultada el
2026-10-01). Resultado parcial, aceptado por el responsable. «Secundaria» indica una fuente de la web
abierta; «sin verificar», que solo se leyó un fragmento.

## Afirmaciones

| ID | Afirmación | Fuentes |
|---|---|---|
| C1 | Con vista dividida, el 95 % usa el mapa; si el mapa está oculto, el 65 % no lo abre; el 70 % de los sitios solo ofrece lista | S8 |
| C2 | Sin superposiciones sobre el mapa; la barra horizontal de filtros y orden funciona mejor que la lateral | S8 |
| C3 | En móvil, lista primero con mapa opcional; el mapa se valora en el detalle (contexto: buscadores de tiendas) | S30 |
| C4 | Síntesis: dividida en escritorio, lista primero con conmutador en móvil | S8, S30 |
| C5 | Bandeja de filtros en móvil con el recuento visible, actualización en vivo y la etiqueta «Filtros» | S31 |
| C6 | Resumen de filtros aplicados con sus valores; sobre la lista en escritorio, fila con desplazamiento en móvil | S9 |
| C7 | Filtros sin jerga y priorizados | S32 |
| C8 | Al menos tres miniaturas y los órdenes esenciales (traslado desde comercio electrónico) | S33 |
| C9 | Los portales muestran el histórico de precios y los días publicados | S36 (sin verificar) |
| C10 | WCAG 2.4.11: el foco no queda tapado | S1 |
| C11 | WCAG 2.5.7: alternativa al arrastre; en el dibujo, un clic por vértice | S1 |
| C12 | WCAG 2.5.8: objetivos de al menos 24 px | S1 |
| C13 | WCAG 4.1.3: uso correcto de `role=status` y `role=alert` | S10 |
| C14 | Leaflet es operable con teclado por defecto; los marcadores necesitan texto descriptivo | S12 |
| C15 | Reglas del patrón de carrusel de la APG | S11 |
| C16 | Evitar el avance automático: galería estática que mueve el usuario | S25, S11 |
| C17 | Tailwind: `@custom-variant dark` y un script en línea contra el parpadeo | S2 |
| C18 | La CSP del proyecto ya admite ese script (`script-src 'self' 'unsafe-inline'`) | `apps/web/next.config.ts` |
| C19 | `cookies()` es asíncrona y fuerza render dinámico; `.set` solo en Server Function o Route Handler, de ahí el POST sin JS | S19 |
| C20 | Leer `cookies()` en el layout bloquea el fallback de `loading.js` | S15 |
| C21 | Propiedad `color-scheme` | S13 |
| C22 | `light-dark()`, Baseline 2024, respeta el `color-scheme` de cada elemento | S14 |
| C23 | Teselas OSM oscuras con filtro CSS solo en el panel de teselas; deriva de color y coste en equipos modestos | S34 (secundaria) |
| C24 | `global-error` no recibe la clase de tema de la aplicación | S16 |
| C25 | Espacios de nombres de `@theme`, espaciado base 0.25rem, reinicio de espacios de nombres | S3 |
| C26 | Variables en `:root`/`.dark` y `@theme inline`; el cambio en tiempo de ejecución es una inferencia que hay que probar | S3, S35 |
| C27 | `next/font` se integra mediante `@theme inline` | S5 |
| C28 | `loading.js` es un Suspense; un 404 en streaming responde 200 con `noindex`; `notFound()` antes del primer `await` que suspende | S15 |
| C29 | `error.tsx` es de cliente; `retry` es estable desde 16.3.0 (válido en 16.3.4) y `reset` sigue existiendo | S16 |
| C30 | `global-error` define su propio `html` y `body` y no admite metadatos | S4, S16 |
| C31 | Convenciones de iconos de la aplicación | S17 |
| C32 | `next/font` sirve las fuentes desde el propio dominio | S5 |
| C33 | `<ViewTransition>` de React en App Router, sin configuración y con degradación elegante | S18, S28 |
| C34 | `page.route` para servir teselas falsas | S20 |
| C35 | Emulación de `colorScheme` | S21 |
| C36 | `toHaveScreenshot`: `mask`, `animations`, `threshold`, `stylePath` | S22 |
| C37 | Las capturas de referencia dependen de la plataforma: generarlas en Linux (Docker) | S6 |
| C38 | `AxeBuilder.withTags` admite `wcag22aa`; la prueba manual sigue haciendo falta | S23, S24 |
| C39 | Duraciones de 100-500 ms: unos 100 ms de respuesta, 200-300 ms en paneles, como mucho unos 400 ms; ease-out al entrar, ease-in al salir | S25 |
| C40 | `prefers-reduced-motion` | S26 |
| C41 | Ejemplo de Next con 150, 210 y 400 ms | S18 |
| C42 | `@starting-style` | S7 |
| C43 | Transiciones en el mismo documento: Baseline desde octubre de 2025; entre documentos, sin Firefox | S27, S28, S29 |

## Fuentes

| ID | Título | URL |
|---|---|---|
| S1 | W3C — What's New in WCAG 2.2 | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ |
| S2 | Tailwind CSS — Dark mode | https://tailwindcss.com/docs/dark-mode |
| S3 | Tailwind CSS — Theme variables | https://tailwindcss.com/docs/theme |
| S4 | Next.js — Error handling (16.3.8) | https://nextjs.org/docs/app/getting-started/error-handling |
| S5 | Next.js — Font | https://nextjs.org/docs/app/api-reference/components/font |
| S6 | Playwright — Visual comparisons | https://playwright.dev/docs/test-snapshots |
| S7 | MDN — `@starting-style` | https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style |
| S8 | Baymard — Split view (secundaria) | https://baymard.com/blog/accommodations-split-view |
| S9 | Baymard — Applied filters (secundaria) | https://baymard.com/blog/how-to-design-applied-filters |
| S10 | W3C — Understanding SC 4.1.3 Status Messages | https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html |
| S11 | W3C ARIA APG — Carousel pattern | https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ |
| S12 | Leaflet — Accessibility | https://leafletjs.com/examples/accessibility/ |
| S13 | MDN — `color-scheme` | https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme |
| S14 | MDN — `light-dark()` | https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark |
| S15 | Next.js — loading.js | https://nextjs.org/docs/app/api-reference/file-conventions/loading |
| S16 | Next.js — error.js | https://nextjs.org/docs/app/api-reference/file-conventions/error |
| S17 | Next.js — App icons | https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons |
| S18 | Next.js — View transitions | https://nextjs.org/docs/app/guides/view-transitions |
| S19 | Next.js — cookies | https://nextjs.org/docs/app/api-reference/functions/cookies |
| S20 | Playwright — Mock APIs | https://playwright.dev/docs/mock |
| S21 | Playwright — Emulation | https://playwright.dev/docs/emulation |
| S22 | Playwright — PageAssertions (`toHaveScreenshot`) | https://playwright.dev/docs/api/class-pageassertions |
| S23 | Playwright — Accessibility testing | https://playwright.dev/docs/accessibility-testing |
| S24 | Deque — axe-core API | https://github.com/dequelabs/axe-core/blob/develop/doc/API.md |
| S25 | NN/g — Animation duration (secundaria) | https://www.nngroup.com/articles/animation-duration/ |
| S26 | MDN — `prefers-reduced-motion` | https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion |
| S27 | MDN — View Transition API | https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API |
| S28 | web.dev — Same-document view transitions, Baseline (14-10-2025) | URL no registrada en la investigación |
| S29 | Chrome for Developers — View transitions, I/O 2024 | URL no registrada en la investigación |
| S30 | NN/g — Mobile maps and locations (secundaria) | https://www.nngroup.com/articles/mobile-maps-locations/ |
| S31 | NN/g — Mobile faceted search (secundaria) | https://www.nngroup.com/articles/mobile-faceted-search/ |
| S32 | NN/g — Filter categories (secundaria) | URL no registrada en la investigación |
| S33 | Baymard — Product list 2025 (secundaria) | URL no registrada en la investigación |
| S34 | Blog sobre teselas oscuras de Leaflet con filtro CSS (secundaria, sin verificar) | URL no registrada en la investigación |
| S35 | Tailwind CSS, discusión #10274: tokens semánticos en oscuro (secundaria, sin verificar) | URL no registrada en la investigación |
| S36 | MeasuringU — Benchmark de portales inmobiliarios 2022 (secundaria, sin verificar) | URL no registrada en la investigación |

---

# Registro de desviaciones

Cambios sobre esta hoja de ruta y su motivo. Material directo para la memoria.

| Fecha | Paso | Cambio | Motivo |
| ----- | ---- | ------ | ------ |
| 2026-10-01 | D.0 | La premisa «hoy tuteo» del punto 5 del prompt era inexacta: el texto mezcla tuteo, primera persona e impersonal. Se decide tuteo uniforme y la reescritura se reparte entre D.6b, D.7, D.9, D.13 y D.14. | Decisión 134; ver `AI-NOTES.md`. |
| 2026-10-01 | D.1 | El paso se parte en D.1a (herramienta y siembra) y D.1b (specs, capturas de referencia y línea base axe), como ya preveía el prompt para más de 800 líneas. D.1a mide bastante más de lo estimado (~790) porque se separó el dataset en `fixture-data.ts` con su test y porque Prettier reparte las líneas largas; el responsable aceptó `size:exception`. Un solo PR con dos commits, sin ramas nuevas. | Decisiones 135-138; presupuesto de revisión (R9). |
| 2026-10-01 | D.3 | Sin fuente propia: pila del sistema. El paso ya no autoaloja una fuente con `next/font` ni elige entre `next/font/google` y `next/font/local`. | Decisión 132. |
| 2026-10-01 | D.6b | La rejilla de una a tres columnas del prompt cede ante filas densas con el precio en una columna derecha fija. | Decisión 132 (FIRST VIEWPORT y mejora de la carátula de casete). |
| 2026-10-01 | D.11 | El mapa de ubicación pasa de un mapa de cliente (reutilizar `search-map.tsx`, carga diferida, `noscript`) a un mapa estático del servidor, sin JS, con teselas de OSM como `<img>` nativo y el área tramada. Exige una decisión propia de D.11 que enmiende R2 con la excepción solo para teselas de `tile.openstreetmap.org`, y el ajuste de `csp-image-policy.test.ts` a esa excepción y nada más. Queda abierto para D.11, sin decidir, el límite de `map-guards.test.ts` (SMV-9). | Decisión 133, del responsable. Descartados: teselas como fondos CSS (esquivan R2 sin decidirlo), mapa de cliente (amplía R4) y solo texto (no orienta). |
| 2026-10-05 | D.2 | El filtro de teselas vive en `globals.css` (selector `html[data-spike-tiles] .leaflet-tile-pane`) y no en `search-map-canvas.tsx`; el experimento añade una sonda en `layout.tsx` y un spec temporal. Las teselas se descargaron con `curl` y no con PowerShell. | Alternar el filtro por atributo permite comparar con y sin él sin recompilar y sin mezclar el experimento con los tokens; el componente queda intacto. `Invoke-WebRequest` se quedó colgado en la primera petición. |
| 2026-10-05 | D.3 | La fuente (`--font-sans`) se declara en `@theme static` y no en `@theme inline` como decía el prompt del paso. | Decisión 141: `static` emite siempre las variables y `inline` solo vale para referencias `var()`; sin fuente propia no hay `next/font`. |
| 2026-10-05 | D.3 | Los roles `text` y `border` de la especificación se llaman `ink` y `rule` (utilidades `text-ink`, `border-rule`), y se añaden `surface-raised`, `surface-sunken`, `ink-on-accent`, `selection` y `shadow-color`. | Decisión 141: evita `text-text` y `border-border`, ambiguos con los prefijos de Tailwind. |
| 2026-10-05 | D.3 | Las cifras tabulares no se definen en `globals.css`: se usa la utilidad `tabular-nums` de Tailwind, que se aplicará en D.6b/D.9. | No hay ningún componente de datos en el alcance del paso; especificación enmendada. |
| 2026-10-05 | D.3 | Un solo PR que supera el presupuesto de 800 líneas revisables (~1410 entre añadidas y borradas, sin contar las 36 capturas PNG, que son binarios; ~1110 de código, test y snapshot y ~300 de documentación); el responsable aceptó `size:exception`. | Tokens, test, snapshot de contraste y documentación obligatoria forman una unidad: partirlos dejaría un test sin su CSS. |
| 2026-10-05 | D.4 | El selector queda de forma provisional en el pie (`AttributionFooter`); D.5 lo mueve a la cabecera. | El prompt del paso ya lo preveía provisional. |
| 2026-10-05 | D.4 | Test nuevo `layout-theme.test.ts` en lugar de ampliar `layout-attribution.test.ts`. | El layout sigue síncrono (decisión 144), así que el test de atribución no cambia; el comportamiento del tema merece su propio fichero. |
| 2026-10-05 | D.4 | El spec e2e `theme.spec.ts` corre en un solo proyecto (`w1280-light`). | La lógica no depende del ancho ni del tema; repetirlo en seis proyectos solo multiplicaría el tiempo. |
| 2026-10-05 | D.4 | El origen público para el `Referer` se toma de la cabecera `Host`, no de `request.url`. | El e2e mostró que Next construye `request.url` con `localhost` mientras el cliente usa `127.0.0.1`; ver decisión 145 y `AI-NOTES.md`. |
| 2026-10-05 | D.4 | Las 36 capturas PNG se regeneraron en Docker y volverán a cambiar en D.5. | El selector del pie aparece en todas; D.5 lo reubica. |
| 2026-10-05 | D.5 | Las reglas axe de regiones las cubre `landmarks.spec.ts` (landmarks únicos, `h1`, destino del salto), no etiquetas best-practice añadidas a `AXE_TAGS`. | Decisión 138: axe se mantiene solo con etiquetas wcag y su línea base no cambia. |
| 2026-10-05 | D.5 | Ficheros fuera de la lista del prompt: `globals.css`, `shell-container.ts`, `apple-icon.png`, tests nuevos (`layout-shell`, `property-detail-metadata`, `app-icons`, `landmarks.spec.ts`) y ediciones de `home-page-nl`, `theme.spec`, `network-guard.spec` y los tests de layout. | Token de contenedor, estilo del enlace de salto, icono de Apple y la cobertura que exige el TDD estricto. |
| 2026-10-05 | D.5 | `<main>` lo posee el layout y las páginas devuelven fragmentos, en lugar de un `<main>` por página. | Decisión 147: un único `<main>` y destino de salto operativo también en las 404 por defecto. |
| 2026-10-05 | D.5 | Un solo PR que supera el presupuesto de 800 líneas revisables (~926 líneas añadidas y ~70 borradas, sin contar las 36 capturas PNG ni los 2 iconos binarios: ~763 de código y tests y ~163 de documentación); aceptado por el responsable. | Código, tests y documentación obligatoria son una unidad; no se recortaron tests, comentarios ni documentación. |
| 2026-10-05 | D.6a | `page` se descarta al quitar un filtro, en lugar de conservarse como pedía el prompt. | Decisión 151: con menos filtros la página N cambia de contenido o queda vacía. |
| 2026-10-05 | D.6a | `lat`, `lng` y `radius` son un único chip («A N km de un punto») que quita las tres claves. | El esquema los exige juntos; quitar uno dejaría una URL inválida. |
| 2026-10-05 | D.6a | «Quitar zona dibujada» desaparece de la fila de la vista y pasa a ser el chip «Zona dibujada». | Un solo patrón de quitar filtros; el enlace de la vista queda solo con «Ver mapa/lista». |
| 2026-10-05 | D.6a | La alerta de parámetros inválidos antepone el nombre del parámetro cuando el mensaje de Zod no lo contiene (`enum`). | La especificación exige que la alerta nombre el parámetro y el mensaje por defecto no lo hace. |
| 2026-10-05 | D.6a | Ficheros fuera de la lista del prompt: `criteria-fields.tsx`, `filter-bar.tsx`, `globals.css`, `e2e/routes.ts` y `filters.spec.ts`; no se extraen secciones de `page.tsx` más allá de los dos constructores de href. | Extracción de campos compartidos, estilo de la barra y cobertura e2e; el resto de la extracción no cabía en el presupuesto. |
| 2026-10-05 | D.6a | Un solo PR que supera el presupuesto de 800 líneas revisables (`size:exception`, aceptado por el responsable); no se contaron las 18 capturas nuevas ni modificadas. | Código, tests y documentación obligatoria son una unidad; no se recortaron tests, comentarios ni documentación. |
| 2026-10-06 | D.6b | El recuento de la lista pierde « · página N» («N resultados en esta página»); el número de página lo da solo el paginador. | Decisión 156: un único indicador de página. Sustituye lo dicho en la decisión 151. |
| 2026-10-06 | D.6b | El estado sin imagen dice «Sin foto» en lugar de «Sin imagen disponible». | El texto antiguo no cabe en la miniatura de 96 px a 320 px. |
| 2026-10-06 | D.6b | La bandeja no se hace siempre visible a 48rem sino a 64rem, y solo con `::details-content`. | Decisión 153: la maquetación de 768 px pertenece a D.8a y una regla sin `@supports` dejaría la bandeja inalcanzable donde no hay soporte. |
| 2026-10-06 | D.6b | Ficheros fuera de la lista del prompt: `pagination.tsx` (nuevo), `filter-bar.tsx`, `globals.css`, `e2e/tray.ts`, `e2e/filter-tray.spec.ts` y los tests `search-labels`, `pagination` y `filter-tray-css`. | Componente y ayudas nuevos que el prompt no nombraba. |
| 2026-10-06 | D.6b | El paginador se comprueba en e2e con `/?page=2` y no hay captura suya: el seed no llega a una página. | Sin cambiar el seed (fuera del alcance) no hay segunda página. |
| 2026-10-06 | D.6b | WebKit queda sin comprobar en el arnés; Firefox sí. | La CSP de producción promueve `http://127.0.0.1` a https en WebKit y el guard de red aborta todo; la comprobación en Safari es manual. |
| 2026-10-06 | D.6b | Un solo PR que supera el presupuesto de 800 líneas revisables (`size:exception`, aceptado por el responsable): ~1140 líneas de código, tests y e2e y ~180 de documentación; no se contaron las 14 capturas regeneradas. | Código, tests y documentación obligatoria son una unidad; no se recortaron tests, comentarios ni documentación. |
| 2026-10-06 | D.7 | El ejemplo no es un placeholder sino texto de ayuda persistente enlazado con `aria-describedby`. | Decisión 158: el placeholder desaparece al escribir y no es un nombre accesible. |
| 2026-10-06 | D.7 | Ficheros fuera de los tres listados: `step-indicator.tsx` (nuevo), `applied-filters.tsx`, `criteria-fields.tsx`, `search-labels.ts`, `search-text-form.tsx`, `globals.css`, `e2e/nl-confirmation.spec.ts` y los tests `search-filters` y `search-labels`. | Componentes y ayudas que el prompt no nombraba; se reutilizan los de D.6a. |
| 2026-10-06 | D.7 | El indicador de pasos solo aparece en el inicio sin parámetros y en `?q=`, no en resultados, mapa ni parámetros inválidos. | Decisión 157: la URL de resultados no dice si vienen del flujo de texto o de la barra. |
| 2026-10-06 | D.7 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): ~1052 líneas autoradas de código, tests y e2e, más la documentación; los tests triplican la previsión. Sin contar las 24 capturas. | No se recortaron tests, comentarios ni documentación. |
| 2026-10-06 | D.8a | Ficheros fuera de la lista del prompt: `search-map-canvas.css` (nuevo), `lib/search-labels.ts`, `e2e/routes.ts`, `e2e/search-map.spec.ts` y los tests `home-page-map`, `search-split-css`, `search-labels` y `map-guards`. | La hoja con tokens, los títulos accesibles y la cobertura e2e no cabían en los seis ficheros nombrados. |
| 2026-10-06 | D.8a | La barra de dibujo se monta con un portal fuera del contenedor de Leaflet, y se conservan las tres hojas de terceros (incluida `MarkerCluster.Default.css`). | Decisión 165: dentro del contenedor un `z-index` de 10 quedaría bajo los paneles de Leaflet y el token de capa no se podría usar. |
| 2026-10-06 | D.8a | La numeración de decisiones se escribió en dos commits: 163, 164 y 167 con la unidad A y 165 y 166 con la B. | La decisión 167 describe código de la unidad B pero se redactó con la A; queda un hueco temporal en la numeración entre commits. |
| 2026-10-06 | D.8a | El reencuadre del mapa oculto usa `ResizeObserver` en lugar del `resize` de Leaflet previsto en el diseño. | Decisión 167: Leaflet solo escucha el `resize` de la ventana y «Ver mapa» no lo emite. |
| 2026-10-06 | D.8a | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): ~1500 líneas autoradas de código, tests, e2e y documentación, sin contar las capturas. | La hoja del mapa (~200 líneas) y el e2e (~170) triplicaron la previsión de la unidad B; no se recortaron tests, comentarios ni documentación. |
| 2026-10-06 | D.7 | Segunda ronda de Docker para las capturas, contra la ronda única de R11. | Las capturas a 320 px mostraron poco espacio bajo los pasos y sobre el panel; no lo detecta ningún test. |
| 2026-10-06 | D.7 | El e2e sin JavaScript conserva `form=criteria` y `zone=` vacío en la URL tras «Buscar». | El formulario envía la marca y todos los campos; se comprueba que no hay `q` y que la zona está vacía. |
| 2026-10-06 | D.8b | Las teselas oscuras no se implementan: se mantiene la decisión 140 (teselas claras en un marco oscuro, sin filtro) y no se toca `globals.css`. `search-map-canvas.tsx` solo cambia `pathOptions` por `className` en la zona. | Decisión 140 (resultado de D.2, el filtro no compensa su coste); el cambio del lienzo es el arreglo de las clases de las capas (decisión 170). |
| 2026-10-06 | D.8b | El estado de la ventana emergente se sigue con los eventos `popupopen` y `popupclose` del mapa y no con una API de `Map`. | `isPopupOpen` existe solo en `Layer`; el diseño suponía una API inexistente (`AI-NOTES.md`). |
| 2026-10-06 | D.8b | El anfitrión de la barra (`.map-draw-host`, `display: contents`) aloja también la mira; una tecla mantenida se consume sin enviar acción. | Ampliación menor de las filas B6 y B7 del diseño: una sola caja para todo lo que va en el marco. |
| 2026-10-06 | D.8b | El test de contraste de tokens (`design-tokens.test.ts`) pasó en verde de inmediato. | Los tokens ya cumplían 3:1 sobre las teselas claras; queda como guarda de regresión, no como motor del cambio. |
| 2026-10-06 | D.8b | Commit extra `31b5359` con el arreglo de `className` de las capas vectoriales, además de los tres de las unidades de trabajo. | El e2e de teclado mostró que las clases de D.8a y del paso 2.6 no llegaban al SVG (decisión 170, `AI-NOTES.md`). |
| 2026-10-06 | D.8b | El paso se pausó tras el diseño y se retomó en otra sesión; la aplicación fue en tres unidades. | Falta de cuota; ningún artefacto se perdió gracias a Engram. |
| 2026-10-06 | D.8b | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable). | Reductor con tests, control, hoja, guardas y e2e forman una unidad; no se recortaron tests, comentarios ni documentación. |
| 2026-10-06 | D.9 | Se añade un `ORDER BY` a `getPropertySources` en `packages/db` (activos primero, precio, id), fuera de la lista de ficheros del paso. | La galería y la lista necesitan un orden determinista; ordenar en `apps/web` lo dejaba sin garantía (decisión 174). |
| 2026-10-06 | D.9 | La ficha se reparte en más componentes que los listados (`PropertySummary`, `PropertyDescription`, `lib/search-return*.ts`, `split-paragraphs.ts`). | Mantener `page.tsx` con sus guardas de `notFound()` y las funciones puras con test propio. |
| 2026-10-06 | D.9 | La galería no está cubierta por capturas e2e. | La siembra del e2e no tiene miniaturas; la cubren los tests de `source-gallery`. Resuelto en el seguimiento con P7 y la ruta `detail-gallery` (decisión 175). |
| 2026-10-06 | D.9 | Seguimiento de la verificación fuera del paso: vivienda P7 en la siembra, ruta `detail-gallery`, `property-detail.spec.ts` y copia de dos PNG en `Dockerfile.e2e`. | Cubrir en e2e la galería, el «—», la nota única, la navegación sin JS y el foco no tapado (decisión 175). |
| 2026-10-06 | D.9 | El caso de ventana baja del foco es 1280×480 y no 1280×600. | A 600 px el panel de P7 (~555 px) cabe bajo su tope (568 px) y no se desplaza por dentro; ver `AI-NOTES.md`. |
| 2026-10-07 | D.10 | El gráfico SVG es obligatorio y no «si aporta», como decía el prompt del paso. | Decisión 133.6: gráfico escalonado y tabla accesible, ambos. |
| 2026-10-07 | D.10 | Ruta e2e nueva `detail-history` sobre P1, fuera de las tareas. | `detail` es P2 y `detail-gallery` P7, sin cambios de precio: sin la ruta, el gráfico no tenía captura ni axe. |
| 2026-10-07 | D.10 | La tabla va dentro de una región con foco y desplazamiento propio; a 320 px «Variación» queda en parte fuera de la vista en P7. | La tabla de P7 sobresalía unos 10 px de la página a 320 px; el diseño reservaba la región para ese caso (decisión 178). |
| 2026-10-07 | D.10 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): ~1780 líneas de código, tests y e2e y ~90 de documentación, sin contar las 30 capturas. | No se recortaron tests, comentarios ni documentación. |
| 2026-10-07 | D.11 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): ~970 líneas de código, tests y e2e y ~80 de documentación, sin contar las 18 capturas. | La previsión era ~780; la geometría y sus tests, el CSS y las guardas pesaron más. No se recortó nada. |
| 2026-10-07 | D.12 | `packages/db/src/detail.ts` (`getPropertySources`) no se modifica: ya devolvía lo necesario. `seed.ts` exporta `insertE2eFixture` para el test de consistencia. La insignia «(no disponible)» por fila desaparece (enmienda la 174; `price-history.tsx` la conserva). Con entrada vacía `compareSourceListings` devuelve `mode: 'empty'` (el diseño, no la especificación). | El cálculo vive en core y el precio ya salía correcto; la columna Estado ya dice lo mismo que la insignia; el modo vacío evita lanzar en una ficha sin anuncios (decisión 180). |
| 2026-10-08 | D.13 | El aviso del tope por cliente (V3, `client-cap-exhausted`) solo se prueba en unitarias, sin ruta e2e. | Necesita escribir en la base (`consumeClientQuota`) y el e2e no tiene credencial de escritura (decisión 135). |
| 2026-10-08 | D.13 | La fecha de siembra e2e se inyecta (`buildE2eFixture(seedNow)`): el dataset es idéntico dentro del mismo día UTC, no entre días. Enmienda la 135. | El tope global cuenta jobs solicitados «hoy» y el e2e no puede escribir: hace falta un job pendiente sembrado con el día del servidor (decisión 181). |
| 2026-10-08 | D.13 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): 1148 líneas añadidas y 125 borradas de código, tests y e2e (previstas ~870), sin contar documentación, las 36 capturas ni `axe-baseline.json`. | El componente y sus tests salieron más largos que en el diseño; no se podía partir sin dejar la página con avisos viejos y nuevos a la vez. |
| 2026-10-08 | D.13 | Los tests nuevos viven en `apps/web/test/` y `packages/db/test/`, no junto al código (`src/**`) como decía el reparto de tareas. | `vitest.config.ts` solo incluye `test/**`. |
| 2026-10-08 | D.12, D.13 | La regla lateral de 3 px de los avisos (`.source-list__warning`, `.coverage-notice`) se sustituye por el panel de 1px de D.7 (decisión 182). Cambian las capturas `coverage-*` y `detail-gallery`. | El suelo de oficio de impeccable prohíbe un borde lateral de color de más de 1px en avisos y alertas; el detector lo marcó (`side-tab`) y el responsable exige seguirlo siempre, sin `ignore`. |
| 2026-10-08 | D.13b | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): 1086 añadidas y 172 borradas de código, tests y e2e (previstas ~805), sin documentación, capturas ni `axe-baseline.json`. | Los tests de CSS leído como texto, el e2e reescrito de la ficha y la alternativa apilada del histórico pesaron más de lo previsto. No se recortó nada. |
| 2026-10-08 | D.13b | Se aplicó la alternativa de filas apiladas del histórico (bajo 30rem, con `data-label` y roles ARIA explícitos) y hubo un commit más (`234158b`). | Sin `nowrap` la tabla de P7 seguía desbordando 8 px a 320 px; el e2e lo midió. |
| 2026-10-08 | D.13b | El módulo de reintentos vive en `packages/core/src/coverage-jobs/`, no en `coverage/`. El chip de filtros aplicados cambió su hover a una clase CSS en la unidad 1 y no en la 2. | `.gitignore` ignora cualquier carpeta `coverage/`; el test de hover prohíbe la variante `hover:` desde la primera unidad. |
| 2026-10-08 | D.13b | Paso nuevo entre D.13 y D.14 para corregir los 14 hallazgos de la auditoría de D.0-D.13 contra `craft-floor.md` de impeccable. | Solo D.3 había cargado el suelo de oficio; el responsable prefiere corregir antes de que D.14-D.17 se construyan sobre la base actual. |
| 2026-10-09 | D.14 | Se descarta `loading.tsx` (ni en la home ni en la ficha) y con él el esqueleto, `LoadingState` y el CSS de mitigación (B3, decisión 191 rechazada). | Spike de la fase 0: sin JavaScript el contenido queda en `<div hidden id="S:n">`; el esqueleto salió en 20/20 peticiones de la home y 19/20 de la ficha, el contenido siguió oculto y fallaron seis pruebas e2e funcionales sin JS. |
| 2026-10-09 | D.14 | La home pasa al grupo de rutas `app/(search)/page.tsx` (decisión 188) y se conserva aunque ya no haya `loading.tsx`. | Un `loading.tsx` raíz envuelve a los layouts anidados y daría 200 a un 404 de la ficha; el movimiento es inocuo y fija la estructura con un test. |
| 2026-10-09 | D.14 | La ficha no tiene `not-found.tsx` propio: el `notFound()` de su `layout.tsx` se resuelve con el raíz (decisión 187). | El raíz mantiene el 404 y ya trae cabecera, pie y salida a la búsqueda; el e2e comprueba el estado HTTP. |
| 2026-10-09 | D.14 | Desaparece la comprobación «el fallback de carga se ve con un retraso artificial». | No aplica tras descartar `loading.tsx`; sin esqueleto no hay fallback que ver. |
| 2026-10-09 | D.14 | El estado vacío tiene un tercer tipo (`past-last-page`) además de «sin viviendas» y «filtros sin resultados», y el enlace de limpieza se llama «Quitar los demás filtros» cuando conserva zona o polígono (decisión 190). | Una página fuera de rango y un polígono vacío necesitan una salida distinta, y un mismo nombre para dos destinos incumple WCAG 3.2.4. |
| 2026-10-09 | D.14 | Se incluye el Registro 134 completo: copy de parámetros inválidos en tuteo con rótulos y mensajes de `packages/core` en español (decisión 192), más un segundo `webServer` en el puerto 3101 para el e2e del 429. | Los mensajes de Zod llegaban en inglés a la pantalla y el limitador del proxy solo se puede ejercitar con tope 1 en un servidor aparte. |
| 2026-10-09 | D.14 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): unas 1400 líneas de código, tests y e2e, sin documentación ni capturas. | Los tests por tipo de estado vacío, la tabla de mensajes del núcleo y el e2e con segundo servidor pesaron más de lo previsto (~1185 tras descartar el esqueleto). No se recortó nada. |
| 2026-10-09 | D.15 | Un solo PR que supera las 800 líneas (`size:exception`, aceptado por el responsable): 934 líneas de código, tests y lockfile (872 añadidas y 62 borradas), sin contar la documentación ni las 62 capturas. | La previsión era ~700 antes del lockfile; el espec de estados dinámicos, el puente de JSX y la corrección del conmutador pesaron más. No se recortó nada. |
| 2026-10-09 | D.15 | F5 queda con exención parcial: las etiquetas de precio del mapa (`.map-price`) pasaron la prueba de espaciado de texto (1.4.12) y no se tocan; la dirección del resultado (`.result-row__address`) sí se recortaba a 320 px y se corrige con `overflow-wrap: anywhere`. Enmienda la decisión 197. | La tarea condicionaba el arreglo a que la prueba fallase primero; en el mapa no falló, así que no hay cambio que justificar. |
| 2026-10-09 | D.15 | `price-history.tsx` lleva siete desactivaciones de `jsx-a11y` por línea y no tres: `tabIndex` de la región, `thead` y `tbody` con rol redundante y cuatro `td role="cell"`. El responsable confirmó mantenerlas. | La alternativa apilada de D.13b necesita los roles de tabla explícitos (decisión 193) y `td role="cell"` es un falso positivo de la regla. |
| 2026-10-09 | D.15 | «Ver mapa» y «Ver lista» medían 20 px de alto a 320 y 768 aunque axe pasaba; se corrigen con `min-block-size: 2.5rem` (decisión 202). No estaba en el diseño y añade una causa más al cambio de capturas a 320 y 768. | La prueba de caja de la tarea R3 falló en rojo: axe no marcó un enlace en línea de 20 px. |
| 2026-10-09 | D.15 | `a11y-states.spec.ts` convierte el árbol que Playwright devuelve al importar `error.tsx` y `global-error.tsx` en elementos de React con el puente de prueba `toReactNode` antes de `renderToStaticMarkup`. | Playwright impone su propio runtime JSX (`jsxImportSource`): los componentes devuelven nodos `__pw_type` y `react-dom/server` lanza «Objects are not valid as a React child». Se sigue escaneando el marcado real. |
| 2026-10-09 | D.15 | La prueba de `draw-frame` de `search-map.spec.ts` mueve el ratón a (0, 0) antes de la captura. | El corrimiento de maquetación por el conmutador dejó el puntero parado sobre el enlace de atribución de OSM y el subrayado `:hover` cambiaba 81 px a 320 px. Con el ratón fuera, la captura coincide con la original. |
| 2026-10-09 | D.15 | 62 capturas regeneradas en Docker (decisión 138): 22 a 1280 (ayuda del mapa y marco de `draw-frame`; galería), 20 a 320 y 20 a 768 (conmutador, dirección y ayuda). | Causas de la lista del diseño más el conmutador de 40 px; el resto de capturas, incluidas `nl-query`, `detail*`, `not-found-*` y `draw-frame` a 320, no cambia. |
| 2026-10-09 | D.15 | El paso queda `[~]` y no `[x]`: la lista manual con NVDA (13 puntos) la ejecuta el responsable. T1.4 (comentario en `site-header.tsx`) no se hizo. | El criterio de cierre exige resultados humanos que el agente no puede dar; T1.4 era opcional y no cambia comportamiento. |
| 2026-10-09 | D.15 | Tras la lista manual, los puntos 11 y 13 fallaron y se corrigen dentro del paso (decisiones 203 y 204): foco al título de las páginas de error y pista «solo cifras». `a11y-states.spec.ts` renderiza ahora los componentes dentro de un envoltorio de React real porque usan ganchos. 24 capturas más regeneradas en Docker (decisión 138). | Son fallos del paso, no trabajo nuevo; el cierre exige que el responsable los vuelva a comprobar. La auditoría estática no vio la falta de gestión del foco (F12 estaba clasificado «comprobar a mano»). |
| 2026-10-09 | D.15 | La lista manual se ejecuta con el Narrador de Windows en Chrome en vez de NVDA, con una sola columna en lugar de las dos previstas por navegador. | NVDA no se pudo instalar en la máquina del responsable; el Narrador viene integrado en Windows y cubre el mismo criterio sin instalación. |
| 2026-10-13 | D.16 | No se usa `@starting-style` para la bandeja y los `<details>`, que el brief pedía. | Una bandeja renderizada abierta en el servidor se fundiría al cargar la página; la investigación (C3) mostró que es su único efecto. El fundido al abrir y cerrar funciona sin él. |
| 2026-10-13 | D.16 | Tests nuevos pese al «ninguno nuevo previsto»: reglas estáticas de CSS y de las opciones del mapa, pruebas unitarias y de contrato del parche de teclado (`map-instant-keyboard.test.ts`) y un espec e2e de movimiento en Chromium (`e2e/motion.spec.ts`, sin capturas). | La barrera de `design-tokens.test.ts` prohibía los tokens de movimiento y el pan de teclado de Leaflet solo se puede probar con un mapa real. |
| 2026-10-13 | D.16 | Los botones del selector de tema se excluyen de la pulsación con escala (decisión 208). | Son envíos de formulario que recargan la página: la animación no se vería. |
| 2026-10-13 | D.16 | La escala de pulsación usa `:active:not(:focus-visible)` y no `:active` a secas (decisión 208). | El brief pide que nada se anime por acciones de teclado repetidas; Firefox además no marca `:active` con Espacio. |
| 2026-10-13 | D.16 | Un solo PR de 1.257 líneas cambiadas con `size:exception` (1.089 de código y tests y 168 de documentación, medidas con `git diff --shortstat e8236f2`) frente al presupuesto de 800, concedido por el responsable. | La previsión era ~770 y se quedó corta en el test de tokens (+246 sobre 95), el del parche (+294 sobre 150) y el espec e2e (+239 sobre 125). No se recortó ningún test. |
| 2026-10-13 | D.16 | El espec e2e usa `w320-light` para el ancho móvil y no 390. | No hay proyecto de 390: los anchos del e2e son 320, 768 y 1280, y 320 ya está por debajo de 64rem. |
| 2026-10-13 | D.16 | El test de contrato de Leaflet lee el fichero de `require.resolve('leaflet')` y no el campo `module`. | Leaflet 1.9.4 no declara `module` en su `package.json`; el diseño lo daba por existente y se corrigió al conciliar las tareas. |
