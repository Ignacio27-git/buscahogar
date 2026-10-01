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
  `style-src 'self' 'unsafe-inline'`. Ni fuentes, ni iconos, ni CDN remotos. Las fuentes se
  autoalojan con `next/font`. La vigilan `apps/web/test/csp-image-policy.test.ts` y
  `apps/web/test/security-headers.test.ts` (decisiones 080 y 112).
- **R2 · Imágenes.** Solo con `next/image`: ni `<img>` nativo ni `unoptimized`. Los hosts remotos son
  los de `images.remotePatterns`, hoy solo `img4.idealista.com`. Añadir uno es una decisión de
  seguridad.
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
  `layout-attribution`, `architecture-attribution` y `map-guards`. Cada paso presupuesta en sus notas
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
  todo el árbol y bloquea el *fallback* de `loading.tsx` (C20). Lo resuelve D.4, antes de que D.14
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
  `NextResponse.redirect(`. Un Route Handler que responda 303 (D.4) construye la respuesta a mano.
- **El *matcher* de `apps/web/src/proxy.ts`** solo excluye `favicon.ico` del límite de peticiones. Los
  iconos nuevos de D.5 pasarían por él.

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

## [ ] D.2 · Experimentos: tokens semánticos y teselas oscuras

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

---

# Bloque 2 — Fundamentos

## [ ] D.3 · Tokens, tipografía y tema oscuro del sistema

```text
Paso D.3 de docs/DESIGN-ROADMAP.md. Carga impeccable (con su craft floor antes de editar
UI) y usa `impeccable typeset` y `impeccable colorize` según el contrato de D.0.

- Tokens en apps/web/src/app/globals.css con el patrón validado en D.2: color (superficie,
  texto, texto secundario, borde, acento, peligro, éxito, foco), escala tipográfica,
  espaciado (base 0.25rem de Tailwind), radios, sombras y capas (el mapa necesita
  z-index propios). Los tokens de movimiento se dejan para D.16.
- Tema oscuro solo según el sistema (el selector llega en D.4), con color-scheme en
  :root.
- Fuente según D.0, autoalojada con next/font y expuesta con @theme inline. Ningún host
  de fuentes remoto; la CSP no cambia.
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

- **Ficheros:** `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx` (clase de la fuente),
  ficheros de fuente si se autoalojan a mano.
- **Tests:** `layout-attribution.test.ts` (si cambia el layout), `security-headers.test.ts`.
- **Riesgos:** R1 (`font-src 'self'`). `next/font/google` descarga la fuente al compilar, así que el
  build necesita red; `next/font/local` no. Decidirlo y registrarlo.
- **Tamaño:** M.
- **Evidencia:** C10, C21, C22, C25, C26, C27, C32.
- **Contrato de D.0 (132):** pila tipográfica del sistema, sin `next/font` (ver desviaciones);
  paleta `#ffffff`, `#1c1f22`, `#e4e2dc`, acento `#1f5fa8` y siena `#b0662b` solo para la trama;
  escala tipográfica cerrada y cifras tabulares. `#e4e2dc` no llega a 3:1 como borde de control. El
  oscuro se deriva aquí tras D.2.

---

## [ ] D.4 · Selector de tema

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

---

## [ ] D.5 · Estructura común: cabecera, pie y metadatos

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

---

# Bloque 3 — Búsqueda y mapa

## [ ] D.6a · Búsqueda: barra de filtros y filtros aplicados

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

---

## [ ] D.6b · Resultados: tarjetas, bandeja de filtros en móvil y paginación

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

---

## [ ] D.7 · Búsqueda en lenguaje natural: interpretación y confirmación

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

---

## [ ] D.8a · Mapa: disposición y marcadores

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

---

## [ ] D.8b · Mapa: tema oscuro y dibujo accesible

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

---

# Bloque 4 — Ficha de la vivienda

## [ ] D.9 · Ficha: presentación

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

---

## [ ] D.10 · Ficha: histórico de precios

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

---

## [ ] D.11 · Ficha: mapa de ubicación

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

---

## [ ] D.12 · Ficha: comparación de fuentes

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

---

# Bloque 5 — Estados

## [ ] D.13 · Avisos de cobertura

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

---

## [ ] D.14 · Estados globales: carga, error, 404, vacío y 429

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

---

# Bloque 6 — Pasadas transversales

## [ ] D.15 · Accesibilidad WCAG 2.2 AA

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

---

## [ ] D.16 · Movimiento

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
