# Decisiones de arquitectura

Registro cronológico. Cada entrada: qué se decidió, qué alternativas se descartaron y por
qué. Sirve de material directo para la memoria del TFM.

Formato: `## NNN — Título` · Estado: aceptada / revisada / revertida.

---

## 001 — Ingesta programada en lugar de consulta en tiempo de búsqueda

**Estado:** aceptada

**Decisión.** El sistema no consulta las fuentes cuando el usuario busca. Ingiere de forma
programada o bajo demanda y sirve las búsquedas contra su propio índice.

**Alternativa descartada.** Modelo _pass-through_, sin escritura en base de datos, con
consulta directa a las APIs en cada búsqueda.

**Motivo.** Tres razones independientes, cualquiera de ellas suficiente:

1. **Cuota.** La API concedida tiene un límite mensual de peticiones. Con consulta directa,
   cada ajuste de filtro gastaría cuota; los propios tests de integración la agotarían.
2. **Latencia.** La deduplicación necesita el conjunto completo antes de agrupar, así que no
   se pueden mostrar resultados parciales. El usuario esperaría a la fuente más lenta más la
   paginación más el procesado, en un producto cuyo argumento es ser más rápido que abrir
   varias pestañas.
3. **Reproducibilidad.** Sin corpus estable no hay conjunto etiquetado, no se pueden comparar
   estrategias de deduplicación sobre la misma entrada, y no se puede reproducir ningún
   número citado en la memoria.

**Encuadre.** No se replica el portal: se mantiene un índice con caducidad. Se refresca, se
retira lo que desaparece, las imágenes se enlazan sin almacenarse y todo resultado conduce
al anuncio original.

**Consecuencia asumida.** Solo se puede buscar en zonas ingeridas. Se mitiga con la
cobertura bajo demanda (decisión 005).

---

## 002 — Separación entre `listings` y `properties`

**Estado:** aceptada

**Decisión.** Dos tablas distintas más una de relación: `listings` (un anuncio de una
fuente), `properties` (vivienda canónica) y `property_listings`.

**Alternativa descartada.** Una única tabla de propiedades con las fuentes como campo
anidado.

**Motivo.** Permite reprocesar la deduplicación completa sin volver a consultar las fuentes,
comparar estrategias distintas sobre el mismo conjunto de datos, y obtener el histórico de
precios como consecuencia del versionado de `listings`.

---

## 003 — Monorepo con worker separado; sin NestJS

**Estado:** aceptada

**Decisión.** `apps/web` (Next), `apps/ingestion` (worker Node), `packages/core` y
`packages/db`. Comunicación solo por base de datos.

**Alternativa descartada.** Backend NestJS independiente; o todo dentro de Next.

**Motivo.** El barrido de fuentes es trabajo programado y de larga duración, incompatible con
el ciclo de vida de una petición HTTP y con los límites de tiempo de las funciones
serverless. NestJS aportaría la complejidad de un framework de backend completo para una API
de lectura de pocos endpoints.

---

## 004 — Next.js con App Router y estado en la URL

**Estado:** aceptada

**Decisión.** Server Components consultando la base de datos directamente. Filtros en search
params. Sin TanStack Query ni Zustand en la ruta principal.

**Motivo.** El listado es mucha data con poca interactividad. Los filtros en la URL hacen las
búsquedas compartibles y reproducibles, y eliminan la necesidad de una capa de estado
servidor en cliente. La optimización de imágenes de Next es relevante porque el listado es
esencialmente una cuadrícula de fotos de terceros.

---

## 005 — Cobertura bajo demanda, unidad municipio

**Estado:** aceptada

**Decisión.** Si la zona solicitada no está cubierta, se registra un `coverage_job`, el
worker la barre y la zona queda cubierta para consultas posteriores. La unidad es el
municipio.

**Alternativa descartada.** Cobertura fija con lista cerrada de zonas.

**Motivo.** Escala a todo el ámbito sin barrerlo de antemano y gasta cuota solo donde hay
demanda real. Provincia sería demasiado costosa en un solo barrido; barrio fragmentaría el
índice sin ganancia.

**Requisitos derivados.** Resolución canónica de zonas (para no ingerir la misma zona bajo
distintas formulaciones), cola en base de datos, y presupuesto de cuota para que el uso del
buscador no agote las peticiones disponibles.

---

## 006 — Criterios de deduplicación

**Estado:** aceptada

**Decisión.** Decisión por acumulación de señales sobre datos estructurados. La dirección
solo cuenta como señal fuerte si es exacta. La comparación de imágenes queda para la fase de
profundización.

**Motivo.** Un mismo bloque genera anuncios con ubicación, superficie y precio muy similares
que corresponden a viviendas distintas: son los falsos positivos más difíciles. Las imágenes
son la señal más concluyente, pero requieren _perceptual hashing_ porque cada portal
reescala y recomprime; aplazarlas permite además medir su aportación real frente a la
deduplicación estructurada.

**Consolidación.** Al agrupar, el precio mostrado es el más económico del grupo.

**Prioridad.** Minimizar falsos positivos por encima de maximizar recall.

---

## 007 — Refresco semanal y retención en dos planos

**Estado:** aceptada

**Decisión.** Refresco semanal para zonas con consultas recientes, menor para las inactivas.
Los anuncios desaparecidos se marcan inactivos y salen de la búsqueda, pero se conservan.
Purga separada para anuncios inactivos y para zonas sin consultas.

**Motivo.** El refresco uniforme gastaría cuota en zonas que nadie consulta. Los inactivos
siguen siendo útiles para el histórico y para el conjunto de evaluación. Las condiciones de
uso de cada fuente prevalecen sobre estos plazos si fijan un máximo de retención.

---

## 008 — TypeScript fijado en 6.0.3, no en la última (7.0.2)

**Estado:** aceptada

**Decisión.** Todo el monorepo usa TypeScript `6.0.3`, no la última publicada (`7.0.2`).

**Alternativa descartada.** TypeScript `7.0.2` (última) renunciando a `typescript-eslint`,
o esperando a que `typescript-eslint` amplíe el rango de peer.

**Motivo.** `typescript-eslint@8.69.0` (el que impone la config de lint compartida y
`eslint-config-next`) declara `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. `6.0.3` es
la versión más alta compatible. Con `7.0.2` el lint con reglas de tipo deja de resolver el
parser. El linting estricto de TypeScript pesa más que ir a la última en un esqueleto sin
lógica todavía. Se revisará cuando `typescript-eslint` soporte la rama 7.

**Consecuencia.** `baseUrl` está deprecado en TS 6 y se elimina en TS 7; se ha quitado de
`tsconfig.base.json` (los alias `@/*` se declaran por paquete donde hagan falta, sin
`baseUrl`).

---

## 009 — Vitest como runner de tests

**Estado:** aceptada

**Decisión.** El runner de tests del monorepo es **Vitest** (`vitest run` por paquete;
`pnpm -r test` en la raíz). Config mínima por workspace en `vitest.config.ts`.

**Alternativa descartada.** `node:test` + `tsx`; Jest.

**Motivo.** `node:test` obligaría a una capa de transpilación aparte para TypeScript y ESM
y no da _watch_ ni _snapshot_ cómodos. Jest arrastra su propio ecosistema de transformación
(`ts-jest` / `babel-jest`) y config pesada, y su soporte de ESM sigue siendo incómodo.
Vitest usa la misma resolución que el resto del _tooling_ (Vite/esbuild), arranca sin
config, y encaja con los tipos de test que pide `CLAUDE.md` (normalización con fixtures,
pares etiquetados de deduplicación, construcción de consultas). Los tests se concentran
donde está la lógica; no se persigue cobertura global.

**Nota.** Los tests actuales son solo _smoke tests_ de versión: el esqueleto no tiene
lógica que probar todavía.

---

## 010 — Tailwind CSS v4 retenido en apps/web

**Estado:** aceptada

**Decisión.** `apps/web` mantiene **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/postcss`,
`postcss.config.mjs`, `@import 'tailwindcss';` en `src/app/globals.css`).

**Alternativa descartada.** Quitar Tailwind y usar solo CSS Modules / CSS global; o
Tailwind v3 con `tailwind.config.js` y directivas `@tailwind`.

**Motivo.** El scaffold inicial (create-next-app) ya venía con Tailwind v4 y la interfaz de
búsqueda (paso 1.11) es esencialmente una cuadrícula de tarjetas: utilidades primero encaja
bien. v4 sobre v3: configuración por CSS (`@theme`) sin fichero JS, y es lo que instala CNA
en esta versión de Next. Import v4 confirmado en `node_modules/next/dist/docs/` (una sola
regla `@import 'tailwindcss';`, sin `@tailwind base/components/utilities`).

---

## 011 — Config de ESLint de apps/web sin `eslint-config-next/core-web-vitals`

**Estado:** aceptada

**Decisión.** `apps/web/eslint.config.mjs` combina `eslint-config-next/typescript` con
`@next/eslint-plugin-next@16.3.4` importado directamente (rule-sets `recommended` y
`core-web-vitals`). No se usa `eslint-config-next/core-web-vitals`.

**Alternativa descartada.** Usar `eslint-config-next/core-web-vitals` tal cual (lo
recomendado por Next); bajar ESLint a la rama 9.

**Motivo.** `eslint-config-next/core-web-vitals` arrastra `eslint-plugin-react@7.37.5`, que
llama a `context.getFilename()` (eliminado en ESLint 10) y rompe `eslint src/` con un
`TypeError`. En el registro de este entorno no hay `eslint-plugin-react` más nueva. Bajar
ESLint a la 9 chocaría con el resto del _tooling_ fijado en la 10. La combinación elegida
conserva las reglas propias de Next (App Router, `<img>`, scripts síncronos, fuentes) y las
de `typescript-eslint`, que son las que importan en este proyecto.

**Consecuencia asumida.** De momento no corren las reglas de `eslint-plugin-react` ni
`eslint-plugin-jsx-a11y`. Se reevalúa al introducir componentes de UI reales (paso 1.11),
cuando exista una versión de `eslint-plugin-react` compatible con ESLint 10 o se decida
usar `@next/eslint-plugin-next` como única fuente. Ver `AI-NOTES.md`.
**Nota (revisión 2026-09-04).** En la primera versión de esta decisión, `apps/web` dejó de
reexportar además la configuración compartida de `packages/config`, quedando con un
conjunto de reglas más laxo que el resto del monorepo. Eso incumplía el requisito del paso
1.1. Corregido: `apps/web/eslint.config.mjs` compone ahora `strictTypeChecked` + las reglas
de Next + los bloques compartidos, estos últimos al final para que prevalezcan. Ver
decisión 012 y `AI-NOTES.md`.

---

## 012 — Linting con información de tipos (`strictTypeChecked`)

**Estado:** aceptada

**Decisión.** La configuración compartida usa `tseslint.configs.strictTypeChecked` con
`parserOptions.projectService`, no el conjunto puramente sintáctico. Se exporta como
factoría (`createSharedConfig(tsconfigRootDir)` y `sharedBlocks(tsconfigRootDir)`) porque
el análisis con tipos necesita la raíz del workspace analizado y el fichero vive en
`packages/config`.

**Alternativa descartada.** `tseslint.configs.strict` (sin tipos), más rápido y sin
necesidad de resolver el programa de TypeScript.

**Motivo.** Sin información de tipos no corren las reglas que más valen en este proyecto:
`no-floating-promises` (un `await` olvidado en la ingesta o en una consulta a base de datos
falla en silencio), `no-misused-promises` y `no-unnecessary-condition`. El pipeline de
ingesta y la capa de acceso a datos son asíncronos de principio a fin: es exactamente el
tipo de código donde esas reglas pagan su coste. El linting pasa de 68 a 123 reglas activas.

**Consecuencia.** `eslint` es más lento y cada workspace debe pasar `import.meta.dirname`.
Los ficheros de configuración (`*.config.ts`, `*.config.mjs`) se lintan con
`disableTypeChecked`, porque no forman parte del programa de TypeScript.

---

## 013 — Sin tests tautológicos: `passWithNoTests` mientras no haya lógica

**Estado:** aceptada

**Decisión.** Los workspaces que aún no tienen lógica (`packages/db`, `apps/web`,
`apps/ingestion`) declaran `passWithNoTests: true` y no contienen tests. `packages/core`
conserva un único test de cadena de herramientas que comprueba que TypeScript estricto,
ESM, la resolución de dependencias bajo pnpm y Vitest funcionan juntos.

**Alternativa descartada.** Mantener un smoke test por workspace afirmando la constante de
versión contra su propio literal (`expect(CORE_VERSION).toBe('0.0.1')`).

**Motivo.** Ese test no puede fallar salvo que alguien edite las dos líneas a la vez, así
que no aporta señal: solo produce un "4 tests passed" que da confianza falsa sobre un
esqueleto sin probar. Un cero honesto es más informativo que un verde vacío. El test de
cadena de herramientas sí puede fallar de verdad — si se rompe la resolución de workspace,
la configuración de TypeScript o el runner — y por eso se conserva.

**Consecuencia.** `pnpm -r test` reporta `No test files found` en tres workspaces hasta que
lleguen la normalización (1.6), la deduplicación (1.9) y la búsqueda (1.11), que son los
puntos donde `CLAUDE.md` concentra los tests.

---

## Pendientes de decidir

- **Umbrales concretos de bloqueo** (radio, banda de precio, margen de superficie): se
  determinan empíricamente sobre el corpus. Verificar antes si las coordenadas de la fuente
  están ofuscadas.
- **Segunda fuente:** depende de accesos aún no concedidos. Alternativa prevista: feeds de
  sindicación de agencias o dataset con esquema distinto.
- **Objetivos de precisión y recall:** tras las primeras mediciones sobre el conjunto
  etiquetado.
- **Segunda zona del corpus:** una de costa con mucha agencia local, a decidir cuando se
  conozca el coste en cuota de la primera.
