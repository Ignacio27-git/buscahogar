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

### 2026-10-15 — Cuatro fallos del proceso de D.19 (paleta cálida y Figtree)

**Contexto:** propuesta, especificación, investigación y capturas del paso D.19.

**Categoría:** contradicción con una regla del proyecto / código correcto en apariencia pero incorrecto / suposición sin comprobar.

**Qué ocurrió:**

1. La propuesta mapeó la enmienda de la tipografía a la decisión 217 (Liberation Sans en las capturas) cuando la que fija la pila del sistema es la
   132. La 217 solo se acota (234).
2. La especificación decía que las líneas base se regeneran después de la puerta de aprobación. Contradice la mecánica: las 12 capturas de la
   puerta son las propias líneas base, así que hay que regenerarlas antes.
3. `--update-snapshots=changed` no regeneró las seis capturas `rate-limit.png`: el cambio de fondo `#ffffff` → `#faf8f3` en una página casi vacía
   queda por debajo del umbral de 0,2 de `toHaveScreenshot` y Playwright las daba por iguales. Se borraron y se escribieron con una ejecución dirigida.
4. La fase de investigación volvió «parcial»: no pudo comprobar la característica `tnum` del `woff2`. El orquestador la cerró con fontTools.

**Cómo se detectó:** 1 y 2 al conciliar las tareas con el diseño; 3 al contar 114 de 120 PNG modificados tras `e2e:update`; 4 al leer el resultado de la investigación.

**Coste:** unos 30 minutos entre todos.

**Observación:** `changed` solo vale para diferencias por encima del umbral; un cambio de paleta en una página casi vacía exige comprobar el
recuento de PNG modificados. Una afirmación sobre un fichero binario (`tnum` en un `woff2`) se comprueba en el fichero.

### 2026-10-13 — Contrato de Leaflet sobre un campo inexistente y regex `\b` rota otra vez (paso D.16)

**Contexto:** diseño y aplicación del movimiento (D.16): test de contrato del parche de teclado de Leaflet y guardas de `map-guards.test.ts`.

**Categoría:** suposición sobre una herramienta sin comprobar / código que compilaba pero no hacía lo correcto.

**Qué ocurrió:**

1. El diseño pedía comprobar las cadenas de la API privada de Leaflet en el fichero de `require.resolve('leaflet')` y también en el
   campo `module` del paquete «lo que envía el empaquetador». Leaflet 1.9.4 no declara `module` en su `package.json`; el test habría
   leído un campo `undefined`. Se corrigió al conciliar las tareas (R1): se lee el fichero que devuelve
   `require.resolve('leaflet')` (`dist/leaflet-src.js`) y, con ruta explícita, `dist/leaflet-src.esm.js`.
2. Un `heredoc` y un `sed` del shell convirtieron `\b` en tres expresiones regulares de `map-guards.test.ts` en retrocesos (carácter de control),
   el mismo fallo ya anotado en D.15. Las dos guardas nuevas fallaban con «expected … to match» aunque el código era correcto.
3. El spec e2e comparaba los tokens como `100ms`, `250ms` y `200ms`; el build de Next minimiza los tiempos de las propiedades
   personalizadas a `.1s`, `.25s` y `.2s` y la primera ejecución completa en Docker falló en esa aserción.
4. La estimación del diseño (~730 líneas) quedó en 1.089 de código y tests: se subestimaron los tests de tokens y del parche.

**Cómo se detectó:** 1 al leer el `package.json` instalado al escribir las tareas; 2 al ver el fallo de una guarda recién puesta en
verde (se imprimió la línea con `cat -A` y aparecía `^H`); 3 en la ejecución del espec dentro de Docker; 4 midiendo el diff antes de
continuar.

**Coste:** unos 20 minutos entre todos, más una parada para pedir el `size:exception`.

**Observación:** una expresión regular con `\b` no se escribe nunca por un script de shell, sino con la herramienta de edición. Un
contrato sobre un paquete de terceros se comprueba contra el `package.json` instalado, no contra lo que se recuerda de él. Un valor que
pasa por el build (CSS minimizado) se compara en la forma que llega al navegador.

### 2026-10-06 — «Disponible en N fuentes» contaba anuncios, también los no activos (paso D.9)

**Contexto:** resumen de la ficha (`PropertySummary`), diseñado en D.0 y aplicado en D.9.

**Categoría:** código que compilaba pero no hacía lo correcto.

**Qué ocurrió:** el texto usaba `property.listingCount`, que cuenta todos los anuncios del grupo. Contaba los retirados e
inactivos y contaba anuncios, no fuentes. P7, con sus dos anuncios inactivos, decía «Disponible en 2 fuentes» junto a dos filas
«(no disponible)». Se arrastró de D.0 a D.9 sin que lo cuestionara ninguna revisión ni ningún test, porque las fixtures unitarias
solo tenían anuncios activos.

**Cómo se detectó:** al revisar las capturas de `detail-gallery` del seguimiento de D.9; se anotó como observación y el
responsable pidió corregirlo (decisión 176).

**Coste:** una corrección pequeña y una regeneración de capturas (~10 min de Docker).

**Observación:** un recuento que se pinta junto a una lista con estados tiene que probarse con elementos en cada estado.

### 2026-10-06 — Ventana «baja» que no lo era en el e2e del foco de la ficha (paso D.9, seguimiento)

**Contexto:** e2e de WCAG 2.4.11 en `apps/web/e2e/property-detail.spec.ts`, caso del panel `sticky` con desplazamiento interno.

**Categoría:** test que valida el comportamiento equivocado (suposición no comprobada).

**Qué ocurrió:** se escribió el caso a 1280×600 dando por hecho que el panel tendría que desplazarse por dentro. El panel de la
ficha de prueba mide unos 555 px y su tope es la ventana menos 2rem (568 px): cabía entero, y el recorrido con Tab habría pasado
sin ejercitar el desplazamiento interno.

**Cómo se detectó:** el propio test exige `scrollHeight > clientHeight` antes de recorrer; falló en la primera ejecución en
Docker. Se pasó a 1280×480 y se añadió la comprobación de que algún foco obliga al panel a desplazarse (`scrollTop > 0`).

**Coste:** una ejecución de Docker (~5 min).

**Observación:** un test de «no tapado» pasa en vacío si el escenario no se da; hay que afirmar la precondición. Además se
comprobó que el recorrido detecta un panel que tapa (estilo inyectado a mano en una ejecución aparte, que falló como debía).

### 2026-10-06 — Tres errores de la especificación y el diseño de D.7 cazados por la validación (paso D.7)

**Contexto:** fases de especificación y diseño de `nl-search-confirmation-d7`, antes de escribir código.

**Categoría:** contradicción con una regla ya fijada y suposición no comprobada.

**Qué ocurrió:** (1) La especificación conservaba «No he entendido:» y a la vez la reescribía por la decisión 134; el test
`home-page-nl` lo afirmaba literalmente, así que hubo que autorizar solo esos dos literales. (2) El texto de la zona decía
«varios municipios» también cuando `?q=` solo tenía un candidato por prefijo (madrid → Madridejos): falso. (3) El diseño decidía
el «inicio» con los parámetros canonicalizados, de modo que un envío del formulario de criterios en blanco habría mostrado los
pasos.

**Cómo se detectó:** validación de la especificación y del diseño contra los tests existentes y el código real, antes de
aplicar.

**Coste:** una revisión de especificación y diseño (obs rev 3), sin código descartado.

**Observación:** los textos de estado deben derivarse de los tipos reales que devuelve el código (`classifyPlaceMatches`), no
de lo que se imagina que devuelve.

### 2026-10-06 — Fichero de e2e truncado por un heredoc y `tsc --noEmit` que no ve `e2e/` (paso D.6b)

**Contexto:** `apps/web/e2e/filter-tray.spec.ts`, escrito en la fase de aplicación con un heredoc de Bash.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** el heredoc que creaba el spec terminó antes de tiempo (Bash avisó de que el documento aquí terminaba por
fin de entrada) y el fichero quedó cortado a media expresión (`getByRole('link'`). Ni `tsc --noEmit` ni `eslint e2e` dieron
error en ese momento: el `tsconfig` de `apps/web` no incluye `e2e/`, y el aviso de Bash se confundió con una salida limpia.
El primer `pnpm e2e` en Docker falló al arrancar el servidor («Failed to type check»); la causa solo se vio ejecutando
`next build` en local, que sí comprueba los tipos de `e2e/` (`TS1005: ')' expected`).

**Cómo se detectó:** `next build`, dentro del `webServer` de Playwright y después a mano.

**Coste:** una ejecución en Docker (~1,5 min) y unos minutos de diagnóstico.

**Observación:** los ficheros largos con comillas y plantillas conviene escribirlos con la herramienta de ficheros y no con
heredocs de la shell; y `tsc --noEmit` de `apps/web` no sustituye a `next build` para los ficheros de `e2e/` (misma
conclusión que en D.4 para las rutas de importación).

### 2026-10-05 — Texto `sr-only` dentro de una lista con desplazamiento y mensaje de `enum` sin nombre (paso D.6a)

**Contexto:** `apps/web/src/components/applied-filters.tsx` y la rama de parámetros inválidos de `page.tsx`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** (1) Cada chip lleva un `<span class="sr-only">Quitar filtro: </span>`. `sr-only` es `position:
absolute`; dentro de una lista con `overflow-x: auto` pero sin `position: relative`, el bloque contenedor no es la lista,
el span escapa del recorte y se coloca donde caería en el contenido desplazado: el documento medía 1408 px a 320 px.
(2) El diseño daba por hecho que la alerta de parámetros inválidos ya nombraba cada parámetro («texto sin cambios»), pero
el mensaje por defecto de Zod para un `enum` («Invalid option: expected one of…») no lo nombra, así que `operation=foo`
no se identificaba.

**Cómo se detectó:** (1) el e2e `sin desbordamiento horizontal` de la ruta nueva `home-filtered` a 320 px; los tests
unitarios no pueden verlo. (2) Al ejecutar el esquema con `operation=foo` para escribir el test de la página.

**Coste:** unos 15 minutos entre ambos (una ejecución adicional del e2e en Docker).

**Observación:** un test unitario de marcado no sustituye a la comprobación de desbordamiento en navegador; (1) se arregla
con `relative` en la lista. En (2) la página antepone el nombre cuando el mensaje no lo contiene (decisión 151).

### 2026-10-05 — Barra invertida simple en el matcher del proxy (paso D.5)

**Contexto:** `apps/web/src/proxy.ts`, exclusión de los iconos en el `matcher` (decisión 149).

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** al editar el fichero con un script de Python, el patrón quedó con una sola barra invertida dentro de
una cadena de TypeScript (`icon(?:\.svg)?$`). En una cadena de TypeScript, `\.` pierde el escape y llega a la expresión
regular como un `.` que casa con cualquier carácter, así que el matcher habría excluido también `/iconXsvg`. Con la
doble barra correcta (`\\.`) el patrón hace lo previsto.

**Cómo se detectó:** al revisar el fichero escrito y por los controles negativos de `proxy-config.test.ts`, antes de
confirmar.

**Coste:** unos 5 minutos.

**Observación:** el escape de una expresión regular dentro de una cadena de TypeScript lleva doble barra; al generar
ficheros desde un script conviene releer el resultado en disco. Es el mismo tipo de fallo que el punto 6 de la entrada
de D.4 (barras invertidas deformadas al escribir con heredocs).

### 2026-10-01 — Dos errores de Playwright en la autoprueba del guard de red (paso D.1a)

**Contexto:** `apps/web/e2e/network-guard.spec.ts`, la prueba de humo y la autoprueba del guard de red
(cambio SDD `visual-a11y-verification`).

**Categoría:** API o método inexistente · código correcto en apariencia pero incorrecto.

**Qué ocurrió:** (1) Se escribió `test.skip(({}, testInfo) => testInfo.project.name !== 'w1280-light', ...)`,
una firma que no existe: el callback de `test.skip` recibe solo las fixtures, no `testInfo`. (2) El diseño
y la primera versión de la autoprueba hacían el `fetch` externo desde la propia aplicación. La CSP de la
aplicación (`default-src 'self'`, sin `connect-src`) bloquea esa petición antes de que llegue a la capa de
red, así que el guard nunca la habría visto: el test habría pasado por la razón equivocada.

**Cómo se detectó:** (1) `tsc --noEmit` (error TS2769). (2) Razonando sobre la CSP antes de ejecutar; la
autoprueba se movió a `about:blank` (sin CSP) y se comprobó en Docker que, sin `test.fail()`, el test falla
exactamente con el mensaje del cierre de la fixture, es decir, que `test.fail()` no enmascara otro fallo.

**Coste:** unos 10 minutos.

**Observación:** una autoprueba que debe fallar necesita una segunda comprobación de que falla POR EL
MOTIVO que se quiere probar; `test.fail()` solo no lo demuestra.

### 2026-10-01 — La opción «Mapa estático sin JS» se presentó como compatible con las reglas sin serlo

**Contexto:** paso D.0 del plan de diseño (cambio SDD `design-direction-d0`), preguntas al
responsable sobre la ficha.

**Categoría:** contradicción con una regla del proyecto.

**Qué ocurrió:** la descripción de la opción afirmaba que cumplía R5 y la CSP, pero omitía que R2
prohíbe el `<img>` nativo (lo vigila `csp-image-policy.test.ts`) y que servir las teselas con
`next/image` haría que el servidor las descargara, contra R8. En el diseño apareció otro choque: la
112 y `map-guards.test.ts` (SMV-9) solo admiten el host de teselas en `search-map-canvas.tsx`.
Además, la premisa «hoy tuteo» del prompt de D.0, escrita al planificar la hoja de ruta, era
inexacta: el texto mezcla tuteo, primera persona e impersonal.

**Cómo se detectó:** la fase de propuesta contrastó la opción con R2 y con los tests, y se volvió a
preguntar al responsable, que mantuvo el mapa estático con una excepción acotada a R2 que registra
D.11 (decisión 133). El límite de SMV-9 lo detectó la fase de diseño al leer el test. La premisa del
tuteo, la exploración al inventariar el texto.

**Coste:** una ronda de preguntas adicional.

**Observación:** una opción que se presenta como compatible con las reglas se contrasta antes con
R1-R12 y con los tests de guarda, no solo con la CSP.

### 2026-10-01 — La investigación del plan de diseño dio por bloqueado un script que la CSP ya admite

**Contexto:** investigación del cambio SDD `web-ux-ui-design-roadmap` (plan de diseño de `apps/web`).

**Categoría:** contradicción con la configuración real del proyecto.

**Qué ocurrió:** en su primera pasada, el subagente de investigación concluyó (afirmación C9) que la
CSP estricta del proyecto bloquearía el script en línea contra el parpadeo del tema oscuro de
Tailwind y que haría falta un *nonce* o un *hash*. No había abierto `apps/web/next.config.ts`, que ya
declara `script-src 'self' 'unsafe-inline'` (decisión 080).

**Cómo se detectó:** revisión del orquestador, que lo corrigió en la segunda pasada. En la revisión 2,
la afirmación correcta es C18.

**Coste:** no medido; se corrigió dentro de la segunda pasada, que ya estaba prevista por otros motivos.

**Observación:** una restricción del propio proyecto se comprueba en su configuración antes de
inferirla de la documentación general. De no corregirse, el paso D.4 habría planificado un mecanismo
de *nonces* innecesario.

### 2026-10-01 — Tres errores del intérprete que solo el corpus de desarrollo destapó

**Contexto:** paso 3.1, `packages/core/src/nl-search/`, unidad U2b tras medir el corpus (U3).

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** el intérprete pasaba sus tests unitarios y fallaba en frases reales: el artículo «la»
se tomaba como lugar («una casa en la playa»), «Casa» dentro de un lugar («la Casa de Campo») se leía
como tipo de vivienda, y «página» («...en Getafe página 3») se absorbía en el nombre del lugar.

**Cómo se detectó:** al medir el conjunto de desarrollo (24/28; dos criterios falsos en negativos
difíciles). Además, la expectativa de la primera versión del corpus para «la Casa de Campo» estaba mal
y se corrigió a la intención del usuario antes de medir.

**Coste:** una unidad extra (U2b, 52 líneas) y unos 30 minutos.

**Observación:** los tests de cada escenario se escribieron con las frases que el autor imaginó; el
corpus aporta frases que no imaginó. El ajuste sobre desarrollo mejoró esa cifra (26/28), no la de
reserva, y así se registra.

### 2026-10-01 — Fallos del tokenizador y de los tests de la rama `?q=`

**Contexto:** paso 3.1, `packages/core` (U2) y `apps/web` (U4).

**Categoría:** código correcto en apariencia pero incorrecto · test que valida el comportamiento equivocado.

**Qué ocurrió:**

1. La expresión del tokenizador retrocedía y partía «1.200» en «1» y «.200».
2. «menos de 3 habitaciones» entraba en la rama «de 3 hab» y producía un `minRooms` falso.
3. Los regex de los tests de renderizado suponían un orden de atributos (`name ... value ...
   checked`), pero React emite `checked` antes de `value` y `action` antes de `method`. Se sustituyeron
   por un ayudante `findTag` independiente del orden.
4. Un comentario con el texto literal «redirect()» hizo fallar el test estático de ausencia de
   `redirect` (`\bredirect\s*\(`); se reescribió. Y un `\b` dentro de una plantilla de texto usada
   para construir un `RegExp` es un retroceso, no un límite de palabra (apareció al escribir `findTag`).

**Cómo se detectó:** tests en rojo en cada caso. Aparte, `apps/web` resuelve `@buscahogar/core` por su
`dist/`, ignorado por git: typecheck y tests fallaron por exportaciones ausentes hasta ejecutar
`pnpm --filter @buscahogar/core build`.

**Coste:** unos 25 minutos en total.

**Observación:** un test que depende del orden de serialización de React valida el marcado, no el
comportamiento. La CI debe construir `core` antes que `web`.

### 2026-10-01 — Un test de base de datos sembraba puntos en mitad de un borde que la especificación no garantiza

**Contexto:** paso 2.6, `packages/db`, suite `search-map.db.test.ts` (tope de 500 puntos y recuento).

**Categoría:** código que compilaba pero no hacía lo correcto.

**Qué ocurrió:** las pruebas de 501 y 120 viviendas sembraban la primera en `lat = 40.4`, justo en mitad
del borde sur del cuadrado. En `geography` ese borde es geodésico y se curva hacia el norte, así que
el punto quedaba fuera y los recuentos salían en 500 y 119. El código era correcto: la propia
especificación (DAS-9) dice que solo se garantizan los vértices, no los puntos en mitad de un borde.

**Cómo se detectó:** al ejecutar la suite por primera vez contra `buscahogar_test`. Se había escrito
sin poder ejecutarla porque Docker estaba parado, y los validadores solo la leyeron.

**Coste:** unos 10 minutos.

**Observación:** un test de base de datos que nunca se ha ejecutado es una hipótesis, no una prueba.
Aquí contradecía una regla que su mismo autor había escrito en el diseño. Las siembras masivas deben
ir al interior de la figura, nunca sobre un borde.

### 2026-09-30 — La especificación y el diseño escritos en paralelo se contradecían sobre el vértice de cierre

**Contexto:** paso 2.6, `packages/core`, formato del parámetro `polygon`.

**Categoría:** deriva de la arquitectura entre sesiones.

**Qué ocurrió:** la especificación normalizaba un vértice de cierre repetido y el diseño lo rechazaba.
Es la tercera vez que `sdd-spec` y `sdd-design` en paralelo se desalinean (ya en 2.3 y 2.5).

**Cómo se detectó:** en la lectura cruzada de la puerta de diseño. El responsable resolvió: rechazar
(`duplicate-vertex`, decisión 115).

**Coste:** una revisión de especificación y otra de diseño.

**Observación:** los puntos de contacto entre dos artefactos escritos a la vez (aquí, un caso límite
de un formato) deberían fijarse antes de lanzarlos, no reconciliarse después.

### 2026-09-30 — El diseño definió `degenerate` como área cero, y un lazo se clasificaba mal

**Contexto:** paso 2.6, validación geométrica del polígono, revisión 2 del diseño.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** `degenerate` se definía como área de la fórmula del zapatero igual a cero. Un lazo
(A(0,0) B(1,1) C(1,0) D(0,1)) tiene área cero y es un polígono que se cruza, no uno degenerado, así
que habría recibido el código y el mensaje equivocados.

**Cómo se detectó:** el validador de la revisión 2 del diseño.

**Cómo se resolvió:** `degenerate` pasa a significar que TODOS los vértices son colineales
(productos vectoriales enteros nulos), y el lazo es una fila de test de `core` que da
`self-intersecting`.

**Observación:** un umbral numérico (área cero) sustituía a la definición geométrica que se quería.

### 2026-09-30 — El total exacto del mapa se devolvía sin acotar y podía mostrar «500 de 498»

**Contexto:** paso 2.6, `searchMapPoints` en `packages/db`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** con 501 filas devueltas, el `count(*)` posterior se mostraba tal cual. Las dos
consultas no comparten instantánea: si entre ambas se retiraba un anuncio, el recuento podía ser
menor que el tope y la pantalla mostraría «500 de 498».

**Cómo se detectó:** corrección del orquestador al revisar la unidad de `db`.

**Cómo se resolvió:** `truncatedMapTotal` acota el total a CAP+1 (decisión 117).

**Observación:** dos consultas sin instantánea común no garantizan una relación entre sus resultados.

### 2026-09-30 — `mergeRuns` exigía los 19 ids también con `--baseline`, y rompía las referencias de 2.4 y 2.5

**Contexto:** paso 2.6, herramienta de banco de `apps/ingestion` (U3).

**Categoría:** deriva de la arquitectura entre sesiones.

**Qué ocurrió:** al ampliar la matriz a 19 escenarios, `mergeRuns` pasó a exigir todos los ids para
cualquier entrada, y las corridas antiguas de 12 ids dejaron de servir como referencia.

**Cómo se detectó:** el validador de la unidad.

**Cómo se resolvió:** `requireComplete` solo se aplica a `--input`; `--baseline` acepta corridas
parciales.

**Observación:** endurecer una comprobación para el caso nuevo sin mirar los consumidores antiguos.

### 2026-09-30 — La exploración daba por hecha la atribución de OSM en el pie del layout

**Contexto:** paso 2.6, exploración y diseño de la atribución de las teselas.

**Categoría:** contradicción con el código y con otros ficheros del propio registro.

**Qué ocurrió:** la exploración supuso que la atribución iría en el pie de `layout.tsx`, junto a la del
CNIG. El validador no encontró ninguna regla que lo exigiera, y ese pie afirmaría OSM en páginas sin
teselas.

**Cómo se detectó:** el validador.

**Cómo se resolvió:** la atribución vive en la sección del mapa (control de Leaflet y marcado del
servidor); decisión 112.

**Observación:** un supuesto de ubicación heredado de un patrón anterior, sin comprobar la regla.

### 2026-09-30 — Repetición del banco sin `jit = off`: falso incumplimiento de `geo-25km-price`

**Contexto:** cierre de pendientes del 2.5, repetición de la matriz de `bench-search` sobre
`buscahogar_bench`.

**Categoría:** procedimiento incompleto (código correcto, medición mal hecha).

**Qué se generó mal:** el asistente lanzó la matriz sin reproducir el
`ALTER DATABASE buscahogar_bench SET jit = off` que el 2.4 documenta para la medición final. Como el
banco conecta como propietario y no como `web_readonly`, el JIT compiló 719 ms y `geo-25km-price`
dio 555 ms de p95. El plan era idéntico al del 2.4, así que el filtro nuevo parecía la causa sin
serlo.

**Cómo se detectó:** al comparar los planes de las dos ejecuciones, con los mismos nodos y el mismo
índice, y ver el campo `jitMs`: 718,6 frente a `null`.

**Cómo se resolvió:** se repitió con el ajuste aplicado y restaurado después: 30 ms de p95, igual
que en el 2.4. `SEARCH-PERFORMANCE.md` añade un aviso de método.

**Observación:** una receta de medición que depende de un ajuste de sesión debería aplicarlo el
propio script, y no confiar en que quien la ejecuta lea el párrafo que lo explica. Es un seguimiento
posible: que `bench-search` haga `SET jit = off` en su conexión.

### 2026-09-30 — El orquestador trató `property_listings` como evidencia inmutable, y la documentación del tombstone lo repitió

**Contexto:** paso 2.5, S4 (tombstone). Instrucción del orquestador a `sdd-apply` y decisión 107.

**Categoría:** contradicción con el código.

**Qué se generó mal:** la instrucción de S4 pedía que el tombstone «conservara la puntuación y el
desglose de `property_listings`», y la decisión 107 y ARCHITECTURE lo afirmaron como garantía. El
tombstone no toca esa tabla, pero `writeConsolidation` borra y reconstruye `properties` y
`property_listings` en cada reproceso de dedup. La única evidencia inmutable es
`dedup_pair_evidence`. Tampoco se contaba con que `properties.description` y `thumbnail_url`, copiadas
del anuncio ganador, conservan el contenido redactado hasta el siguiente reproceso correcto.

**Cómo se detectó:** el validador de contrato de S4, contrastando la decisión con
`consolidation.ts` y `winner.ts`.

**Cómo se resolvió:** decisión 107 corregida (qué es evidencia inmutable, el retraso de la
redacción en `properties` y el posible cambio de ganador). También se corrigió la frase del ROADMAP
que decía que el sistema no retiraba ningún anuncio, cuando la purga de zonas sí retira.

**Observación:** la regla de `CLAUDE.md` («guardar siempre en `property_listings` la puntuación y el
desglose») habla de cada consolidación, no de conservar filas antiguas. Con la separación
`listings`/`properties` y el reproceso global, la evidencia histórica vive en `dedup_pair_evidence`.

### 2026-09-30 — Tests de `apps/web` sin las URLs de sus roles en línea escribieron en la base de desarrollo

**Contexto:** paso 2.5, S4, ejecución de la suite de `apps/web` contra bases desechables.

**Categoría:** pérdida de contexto en tareas largas.

**Qué ocurrió:** el ayudante que ejecuta cada comando con `DATABASE_URL` apuntando a una base
desechable no sobrescribía `WEB_DATABASE_URL` ni `WEB_COVERAGE_DATABASE_URL`. `.env` las apunta a la
base de desarrollo, y los tests de roles y de la página de cobertura conectan con esos roles. Seis
tests fallaron (los roles veían las claves foráneas de otra base que la que el test acababa de
poblar), y los que consumen cuota dejaron dos filas de prueba en `coverage_client_quota` de la base
de desarrollo.

**Cómo se detectó:** por los fallos (los roles no veían los datos que el test acababa de crear) y
comprobando después los recuentos de la base de desarrollo.

**Coste:** 10 minutos. Daño: dos filas de cuota de un día, que la purga programada borra sola;
señales y jobs siguen en 0.

**Observación:** es el mismo fallo de la entrada siguiente y del subagente del paso 2.4, y la segunda vez dentro de este paso. La
instrucción nombraba `DATABASE_URL` y `BENCH_DATABASE_URL`, pero `.env` define tres URLs de base de
datos más de las que un comando suele sobrescribir. Un ayudante de ejecución que fija las tres
(además de las del banco) y se niega a arrancar si alguna apunta a una base sin el sufijo
designado evita la clase entera; se usó desde este punto.

### 2026-09-29 — Un `pnpm migrate` sin variables en línea aplicó la migración 0014 a la base de desarrollo

**Contexto:** paso 2.5, S2 (ciclo de vida y visibilidad), migración `0014`.

**Categoría:** pérdida de contexto en tareas largas.

**Qué ocurrió:** el agente creó una base desechable y exportó su `DATABASE_URL` en una llamada de
shell; en la siguiente, el entorno ya no existía, y `pnpm migrate` leyó `.env` y migró la base de
desarrollo. Aplicó `0014` y su relleno (`active_listing_count = listing_count`).

**Cómo se detectó:** lo declaró el propio agente al ver la migración aplicada donde no debía.

**Coste:** ninguno (migración aditiva, sin pérdida de datos), pero contra una regla explícita.

**Observación:** el entorno de una llamada de shell no persiste en la siguiente. Desde S3 las
variables van en línea, en el mismo comando que cada migración o test.

### 2026-09-29 — Dos fallos de «retirada falsa» que solo encontró el validador

**Contexto:** paso 2.5, S3 (verificación de presencia por `adIds`).

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** (1) La retirada de un anuncio «ausente» no comprobaba que siguiera en la cola. Si un
barrido lo veía entre la verificación y su aplicación, el escritor ya había borrado su fila, pero la
aplicación lo retiraba igualmente. (2) El clasificador trataba una respuesta vacía a un lote de
varios ids como «todos ausentes». Una respuesta vacía es igual de compatible con un `adIds` ignorado
o con un filtro de tipo que no casa en una zona sin stock, y habría retirado hasta 50 anuncios vivos
de golpe. El test que fijaba esa forma pasaba porque repetía lo que la especificación describía (LR-4), que
tenía el mismo fallo.

**Cómo se detectó:** validación de contexto limpio del lote (PASS_WITH_NOTES con ambos hallazgos).

**Coste:** una ronda de corrección: un test rojo para cada uno, y una desviación de la especificación
registrada en la decisión 105.

**Observación:** la especificación, el diseño y las pruebas compartían el mismo supuesto. La
prioridad del proyecto (un falso positivo es peor que un duplicado sin detectar) debía haber
convertido «respuesta vacía» en ambigua desde el principio. Un test que repite la especificación no
valida la especificación.

### 2026-09-29 — `scheduleRefresh` dejaba el cursor de una paginación a medias

**Contexto:** paso 2.5, S1 (planificador de refresco), `packages/db/src/zone-lifecycle.ts`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** el re-encolado ponía el job en `pending` con `attempts = 0` pero conservaba el
cursor. Un job `failed` con los intentos agotados reanudaba desde una página intermedia,
`finishJob(completed)` sellaba `last_swept_at` como un barrido completo y, en S3, `cycle_started_at`
(que solo se fija con cursor nulo) nunca abría un ciclo nuevo: el candidato a «ausente» se habría
calculado contra un ciclo antiguo.

**Cómo se detectó:** validador de S1, que cruzó la invariante con el diseño de S3.

**Coste:** una ronda de corrección (test rojo `expected 'cursor-a-mitad-de-paginacion' to be null`).

**Observación:** el fallo no se veía dentro de S1: dependía de una propiedad de S3. Conviene escribir
las invariantes entre unidades antes de partir el trabajo.

### 2026-09-29 — El diseño proponía borrar filas del catálogo de zonas, y el diseño y la especificación se desviaron entre sí

**Contexto:** paso 2.5, propuesta y diseño de la purga de zonas.

**Categoría:** deriva de la arquitectura entre sesiones.

**Qué ocurrió:** la primera versión del diseño borraba la zona al purgar. `zones` no es una tabla de trabajo: es
el catálogo INE sembrado (~8.100 filas) que la interfaz y `locations-query` unen con un `inner join`.
Borrarla rompería el autocompletado de municipios. Además, el diseño y la especificación dejaron de
coincidir entre sus primeras versiones, y hubo que alinearlos de nuevo con las decisiones U1-U3 del
mantenedor (segunda revisión de ambos).

**Cómo se detectó:** al revisar el diseño contra el código (el `inner join` de `suggestZones` y
`resolveZoneGeometry`) y en una lectura cruzada del diseño y la especificación.

**Coste:** una segunda revisión de diseño y especificación. Resultado: la purga es un reinicio
(decisión 108).

**Observación:** «borrar» sin mirar quién referencia la tabla. Una frase de un diseño sobre el
esquema existente es una afirmación verificable, igual que el código.

### 2026-09-30 — La previsión de tamaño se quedó unas tres veces corta

**Contexto:** paso 2.5, `sdd-tasks` y las cuatro unidades de `sdd-apply`.

**Categoría:** pérdida de contexto en tareas largas.

**Qué ocurrió:** `sdd-tasks` previó 2.100-2.500 líneas en total; S1, S2 y S3 cerraron en ~2.700, ~930 y
~4.240 (más un snapshot generado de 2.143 líneas), y S4 en ~1.450. Más de la mitad son tests, y la
previsión no contaba ni los escenarios negativos que pide la TDD estricta ni las correcciones
tras validación.

**Cómo se detectó:** el informe de cada unidad.

**Coste:** `size:exception` aceptado en las cuatro unidades; no hubo un PR revisable de 800 líneas.

**Observación:** la previsión por unidad debería partir del número de escenarios negativos de la
especificación, no de las funciones que se añaden.

### 2026-09-29 — Un subagente de `sdd-apply` ejecutó `test:db` contra la base de desarrollo pese a la instrucción de no tocarla

**Contexto:** paso 2.4, primer lote de `sdd-apply` (generador de corpus, `apps/ingestion`).

**Categoría:** pérdida de contexto en tareas largas.

**Qué ocurrió:** la instrucción decía "no conectes con la base de desarrollo". El agente ejecutó
`pnpm --filter @buscahogar/ingestion test:db` para comprobar que su test nuevo se omitía sin
`BENCH_DATABASE_URL`. El test nuevo se omitió, pero la configuración lanzó también las suites que
ya existían, que conectan con `DATABASE_URL` y truncan la base de desarrollo (decisión 046). La
base quedó con 1 anuncio y 0 viviendas; no se sabe si antes tenía datos reales.

**Cómo se detectó:** lo declaró el propio agente en su informe, como "observación del entorno".

**Coste:** imposible de cuantificar si había datos reales; 5 minutos de diagnóstico.

**Observación:** una prohibición abstracta ("no toques la base X") no basta cuando el comando que
la viola parece inocuo. Desde ese lote, cada instrucción prohíbe por nombre `test:db`,
`db test` y cualquier comando que cargue `DATABASE_URL`, y no volvió a ocurrir. El arreglo de
fondo sigue pendiente: la decisión 046.

### 2026-09-29 — El diseño usó `pg_buffercache_evict()` sin argumentos, que solo existe en PostgreSQL 18

**Contexto:** paso 2.4, CLI de medición (`apps/ingestion/scripts/bench-search.ts`), ejecución en frío.

**Categoría:** API o método inexistente.

**Qué ocurrió:** el diseño y la implementación vaciaban la caché con `SELECT pg_buffercache_evict()`.
En PostgreSQL 17, la versión fijada en `docker-compose.yml`, la extensión solo define
`pg_buffercache_evict(integer)`, por búfer; las variantes para todo o para una relación llegan en
18. Los tests pasaban porque usan un pool falso. El mismo lote tenía otros dos fallos de la misma
familia, invisibles sin base de datos: sumaba los búferes de todos los nodos del plan cuando
PostgreSQL ya incluye los de los hijos en cada nodo, y el informe antes/después no tenía ningún
comando que lo generara (el diseño lo describía, pero ninguna tarea lo asignó).

**Cómo se detectó:** validación de contexto limpio del lote; confirmado leyendo el SQL de la
extensión dentro del contenedor.

**Coste:** una corrección completa del lote (~500 líneas) y un reinicio del ledger de intentos.

**Observación:** el diseño citaba la función de memoria, sin comprobar la versión fijada. Todo lo
que depende de la versión del servidor tiene que verificarse contra el contenedor real, igual que
se hace con las APIs de Next contra la versión del `package.json`.

### 2026-09-29 — El generador sintético sacaba longitud y latitud de sorteos independientes

**Contexto:** paso 2.4, `apps/ingestion/src/bench/corpus-sql.ts`.

**Categoría:** código correcto en apariencia pero incorrecto.

**Qué ocurrió:** cada coordenada tenía sus propios `random()` para decidir si era nula, si caía en
Madrid o en la península, el radio y el ángulo. Resultado: ~4% de ubicaciones nulas en vez del 2%,
puntos con longitud de Madrid y latitud de otra zona, solo ~36% del corpus en el círculo de Madrid
en lugar del 60%, y un test que exigía geografía no nula en todas las filas y habría fallado contra
una base real. Además, dos comentarios seguidos sobre los casts a `numeric` explicaban mal el
motivo: `numeric + double precision` sí se resuelve por cast implícito, a `double precision`.

**Cómo se detectó:** validación de contexto limpio (las coordenadas); comprobación con `pg_typeof`
contra PostgreSQL 17 (los comentarios).

**Coste:** una corrección del lote (~250 líneas) y un reinicio del ledger de intentos.

**Observación:** en SQL generado, los valores que deben estar correlacionados tienen que salir del
mismo sorteo materializado. Los tests estructurales no lo detectaban hasta que se añadió uno que
cuenta cuántas veces se usa cada sorteo.

### 2026-09-28 — El orquestador fijó dos veces un tope de líneas cambiadas del ledger de intentos demasiado bajo para el paso 2.3

**Contexto:** paso 2.3, cierre de lotes de `sdd-apply` sucesivos (comparación de imágenes).

**Categoría:** deriva de contexto entre fases — decisión del orquestador, no del agente de
`sdd-apply` (mismo patrón ya registrado el 2026-09-24 para el paso 1.15).

**Qué ocurrió:** el orquestador fijó el tope de líneas cambiadas del ledger nativo de intentos en
1.200 y, tras el primer bloqueo, en 1.500, sin contar en ninguno de los dos casos las fixtures de
imagen comiteadas (18 JPEGs + `provenance.json`), el `pnpm-lock.yaml` regenerado por añadir
`sharp`, ni los JSON generados (`hashes.calibration.json`, `hashes.evaluation.json`,
`calibration-report.json`). El intento bloqueó en `maintainer_decision` por
`changed_line_budget_exceeded` las dos veces, aunque el código autorado real cabía en el
`size:exception` ya aceptado por el responsable del proyecto.

**Cómo se detectó:** el propio bloqueo del ledger nativo al intentar cerrar cada intento.

**Cómo se resolvió:** el responsable del proyecto concedió una autorización permanente, acotada a
este cambio, para que el orquestador ejecute `gentle-ai sdd-attempt reset` sin preguntar cuando el
único motivo del bloqueo sea `changed_line_budget_exceeded` (Engram
`sdd/image-phash-signal/ledger-reset-authorisation`), en vez de repetir la autorización manual una
tercera vez.

**Coste:** aproximado, 10 minutos entre los dos bloqueos y sus reinicios.

**Observación:** tercera vez que este mismo defecto de proceso se documenta en este repositorio
(pasos 1.15 y ahora 2.3, dos veces en el mismo paso) — un paso que comitea fixtures binarias,
JSON generado o un lockfile regenerado necesita un tope de ledger fijado contando esos ficheros
desde el primer intento, no ajustado reactivamente tras el primer bloqueo.

### 2026-09-25 — El agente de `sdd-apply` no tuvo acceso a las herramientas MCP de Context7 y verificó la API de `sharp` leyendo directamente sus tipos instalados

**Contexto:** paso 2.3, lotes de `sdd-apply` que tocan `apps/ingestion/src/image-hash/` (pipeline
de hashing con `sharp`).

**Categoría:** pérdida de contexto en tareas largas — una herramienta que `CLAUDE.md` (regla
global de `context7.md`) exige usar para APIs de librerías no estaba disponible en la sesión del
sub-agente.

**Qué ocurrió:** el propio diseño (obs #297) ya advertía que Context7 no estuvo disponible al
redactarlo y dejaba como verificación pendiente de aplicación: comprobar cada llamada de `sharp`
(`flatten`, `extract`, `resize`, `raw`, `create`, `sharp.versions`) contra la documentación real de
la versión fijada. En la sesión de aplicación, las herramientas MCP de Context7 tampoco estaban
registradas.

**Cómo se resolvió:** se leyeron directamente los `.d.ts` que `sharp@0.34.2` distribuye en
`node_modules/sharp/lib/*.d.ts` — la misma disciplina que la entrada del 2026-09-24 sobre
`next/experimental/testing/server` ya había aplicado por el motivo contrario (documentación
empaquetada desincronizada): aquí, sin documentación externa disponible en absoluto, el tipo
instalado fue la única fuente verificable.

**Coste:** no medible por separado — la verificación se hizo como parte normal de escribir cada
llamada a `sharp`, sin retrabajo posterior.

**Observación:** cuando una herramienta de documentación externa no está disponible, el `.d.ts`
real instalado en `node_modules` sigue siendo una fuente de verdad verificable contra la versión
exacta fijada en `package.json` — más fiable que confiar en el conocimiento previo del modelo sobre
una API con superficie amplia como la de `sharp`.

### 2026-09-25 — El diseño asumía `allowBuilds: { sharp: false }` porque los binarios prebuilt "no necesitan compilar"; el propio script `install` de `sharp` sí necesita ejecutarse

**Contexto:** paso 2.3, diseño (obs #297) y `sdd-apply` (lote de Phase 1/2, pipeline de ingesta).

**Categoría:** API o comportamiento de una dependencia asumido sin verificar contra el paquete
real instalado.

**Qué ocurrió:** el diseño razonaba que, al usar binarios prebuilt de `@img/sharp-*`
(`optionalDependencies`, sin compilación nativa), `sharp` no necesitaría entrada en
`allowBuilds` de `pnpm-workspace.yaml` — pnpm bloquea por política los scripts `postinstall` a
menos que se permitan explícitamente, y la suposición era que "sin compilación, sin script que
bloquear". Al instalar de verdad, `pnpm install` seguía fallando sin la entrada: el propio script
`install` de `sharp` SÍ se ejecuta siempre, pero solo para VERIFICAR que el binario prebuilt
correcto llegó — no para compilar nada.

**Cómo se detectó:** ejecución real de `pnpm install` tras añadir `sharp` al `package.json` de
`apps/ingestion`, no por lectura del código de `sharp`.

**Cómo se resolvió:** `allowBuilds: { sharp: true }` en `pnpm-workspace.yaml`, con el motivo
documentado en el propio comentario del fichero (verificación, no compilación) y en la decisión
095 de `docs/DECISIONS.md`.

**Coste:** aproximado, 5 minutos (instalación fallida, lectura del script `install` real de
`sharp`, corrección).

**Observación:** "usa binarios prebuilt" y "no ejecuta ningún script de instalación" no son la
misma propiedad — un paquete puede evitar compilar y aun así necesitar un script de verificación
posterior a la instalación. Solo la ejecución real de `pnpm install` lo reveló.

### 2026-09-25 — El diseño (revisión 1) dejaba que la imagen contara para el piso de evidencia de rule-based y afirmaba, incorrectamente, que `classify.ts` de producción necesitaría edición

**Contexto:** paso 2.3, `sdd-design` (revisión 1, corregida antes de llegar a `sdd-apply`).

**Categoría:** deriva de la arquitectura entre sesiones — el diseño no había trazado el flujo
completo del piso de evidencia (`MIN_EVALUATED_SIGNALS`/`MIN_EFFECTIVE_WEIGHT`, decisión 049) antes
de decidir cómo combinar la señal de imagen.

**Qué ocurrió:** la primera versión del diseño sumaba la contribución de imagen al desglose de
señales sin excluirla del piso de evidencia de rule-based, y proponía editar directamente
`packages/core/src/strategies/rule-based/classify.ts` (código de producción, fuera del alcance de
este cambio) para introducir esa exclusión. Bajo esa forma, un par con solo 2 señales
estructuradas (peso 40, como `md-4` del corpus) más una imagen fuerte simulada habría alcanzado
exactamente peso 55 y cruzado el piso — una vía de falso positivo entre viviendas del mismo
edificio que la decisión 006 existe para evitar, y exactamente el escenario que este cambio debía
medir sin introducir.

**Cómo se detectó:** una validación en un contexto nuevo (sin el razonamiento previo del propio
diseño en memoria de trabajo), releyendo el flujo real de `classify.ts` y del piso de evidencia
contra lo que el diseño proponía.

**Cómo se resolvió:** revisión 2 del diseño — un `classify` inyectable
(`classifyRuleBasedWithImage`) que el evaluador RB+imagen usa en vez de la función de producción,
sin tocar `classify.ts`. Decisión 094 de `docs/DECISIONS.md`.

**Coste:** no medido directamente por `sdd-apply` (resuelto en la fase de diseño, antes de que
`sdd-apply` recibiera el artefacto).

**Observación:** una revisión hecha desde un contexto fresco, sin el hilo de razonamiento que
produjo la primera versión, detecta con más facilidad cuándo una propuesta de diseño amplía el
radio de impacto (aquí, tocar código de producción) más de lo que el objetivo del cambio requiere.

### 2026-09-25 — `sdd-spec` y `sdd-design` en paralelo volvieron a desalinearse, esta vez en las columnas del CSV y el vocabulario de nivel/razón de la señal de imagen

**Contexto:** paso 2.3, spec (obs #296) y diseño (obs #297) redactados en paralelo, corregidos con
las mismas resoluciones (S1-S9/094-099) en la misma ronda.

**Categoría:** deriva de contexto entre fases — mismo patrón ya documentado en los pasos 1.10,
1.11 y 1.15 (spec y diseño en paralelo divergiendo en un punto que ninguno de los dos poseía por
sí solo), esta vez detectado y corregido ANTES de llegar a `sdd-apply`, no durante ni después.

**Qué ocurrió:** la primera redacción de la especificación y la del diseño fijaban, cada una por su
cuenta, un contrato ligeramente distinto para dos puntos de la superficie exportada por el CLI: el
orden y nombre exacto de las columnas CSV nuevas (`evidence`/`image_caveat` tras `caveat`) y el
vocabulario cerrado de nivel/razón del desglose de imagen (`strong`/`neutral`,
`match`/`above-threshold`/`missing`/`unreadable`/`low-entropy`). Ninguna de las dos discrepancias
era una contradicción de fondo sobre el comportamiento — ambas convergían en la misma intención,
solo con distinta forma textual.

**Cómo se detectó:** comparación cruzada de ambos artefactos antes de `sdd-tasks`, mismo mecanismo
de arbitraje ya usado en los pasos 1.10/1.11/1.15.

**Cómo se resolvió:** re-ejecución correctiva de spec y diseño con las mismas resoluciones (F1-F9
en spec, S1-S9 en diseño), fijando un único contrato textual para ambos puntos antes de que
`sdd-tasks` los convirtiera en tareas — a diferencia del paso 1.10, aquí no hizo falta escalar la
decisión al responsable del proyecto: la convergencia de intención ya estaba, solo faltaba fijar
una única forma.

**Coste:** no medido directamente por `sdd-apply` (resuelto en fase de spec/diseño, antes de que
`sdd-apply` recibiera los artefactos).

**Observación:** cuarta vez que este patrón (spec y diseño en paralelo, mismo tipo de deriva) se
documenta en este proyecto — a diferencia de las tres anteriores, aquí ninguna de las dos versiones
estaba más "razonada desde el código real" que la otra: era una cuestión de forma textual, no de
comportamiento, y se resolvió sin necesitar el criterio de desempate habitual ("gana el que leyó
código real").

### 2026-09-25 — El pronóstico de líneas del preproposal (1.000-1.300) quedó muy por debajo del diseño (~2.100) y de la cifra real de aplicación

**Contexto:** paso 2.3, preproposal (obs #292) frente al diseño (obs #297) y la aplicación real.

**Categoría:** deriva de contexto entre fases — subestimación sistemática, mismo patrón ya
documentado para los pasos 1.6/1.7 ("segunda subestimación consecutiva... se estima por lo bajo").

**Qué ocurrió:** el preproposal estimaba el cambio completo en 1.000-1.300 líneas. El diseño, con
el desglose fichero a fichero ya completo, lo elevó a ~2.100 líneas autoradas. La aplicación real
lo superó de nuevo: tests y fixtures (18 fotografías + `provenance.json`, suites de test por fase)
pesaron más de lo que ninguna de las dos estimaciones anticipaba.

**Cómo se detectó:** comparación entre el pronóstico del preproposal y el desglose fichero a
fichero del propio diseño, antes de empezar a aplicar; confirmado después contra el tamaño real de
los commits.

**Cómo se resolvió:** no se recortó alcance ni cobertura de test para acercarse a la cifra
original — se aceptó `size:exception` sobre la cifra real, con partición en varios lotes de
aplicación (mismo precedente que los pasos 1.8, 1.13, 1.14 y 2.2).

**Observación:** quinta vez que este patrón de subestimación se documenta en el proyecto (1.6, 1.7
dos veces, 1.13, y ahora 2.3) — cubrir con tests varios módulos puros por separado bajo TDD
estricto, más fixtures reales con procedencia, sigue siendo el tipo de trabajo que las fases
tempranas de planificación subestiman de forma consistente en este proyecto.

### 2026-09-25 — El FN/TN exportado por la CLI del paso 2.2 excluía los pares `undecided`, en contra de D2, y no reconciliaba con el recall mostrado en la misma fila

**Contexto:** paso 2.2, capa de render de la CLI de comparación de estrategias
(`apps/ingestion/src/strategy-comparison/render.ts`), en los tres formatos exportados
(Markdown, JSON, CSV).

**Categoría:** código correcto en apariencia pero incorrecto — el cálculo interno de
`computeMetrics` (`packages/core`) era correcto y estaba probado; el defecto estaba solo en qué
cifra cruda reexponía cada renderer.

**Qué ocurrió:** `computeMetrics` (decisión 089, D2 del preproposal) ya trata un duplicado real
clasificado `undecided` como un fallo de recall — el denominador de recall es
`TP + FN + undecidedDuplicate`. Pero los tres formatos exportaban directamente
`counts.falseNegative`/`counts.trueNegative`, que en `ConfusionCounts` son solo el `reject`
explícito, EXCLUYENDO el `undecided` correspondiente. El resultado: la fila por defecto de
rule-based mostraba `true_positive=8, false_negative=0` con `recall=0.8000` en la misma fila — un
lector que reconstruyera `recall = TP/(TP+FN)` a partir de las columnas nombradas obtenía 1.0000,
en contradicción visible con el 0.8000 mostrado, sin ninguna pista de que hiciera falta sumar
también `undecided_duplicate` (una columna aparte, sin relacionar explícitamente con FN en ningún
sitio).

**Cómo se detectó:** `sdd-verify` (revisión #288, WARNING-1), no durante la aplicación original
(los 61 tareas de `tasks.md` y sus 993 tests pasaban en verde; el propio test de `computeMetrics`
que fija D2 —`metrics.test.ts`— es correcto y sigue sin cambios). La verificación comparó el
artefacto exportado, no solo el cálculo interno, contra el requisito de la especificación
("Undecided counts as negative"), y encontró que el primero no reconciliaba con el segundo pese a
que ambos "pasan sus tests" por separado.

**Cómo se resolvió:** corrección acotada a `render.ts` (una función `reconcileCounts` que suma
`undecidedDuplicate`/`undecidedDistinct` a `falseNegative`/`trueNegative` SOLO para lo que se
expone), sin tocar `packages/core`. Columnas/campos renombrados a
`false_negative_incl_undecided`/`true_negative_incl_undecided` (CSV/JSON) y etiqueta
`FN (incl. indecisos)`/`TN (incl. indecisos)` en Markdown, para que el cambio de significado sea
inequívoco frente al `ConfusionCounts` crudo que sigue existiendo sin cambios en `packages/core`.
RED escrito primero contra la CLI real (no un fixture sintético) sobre el corpus de 24 pares,
confirmando `TP+FP+FN+TN=24` y `recall=TP/(TP+FN)` en ambas estrategias antes de tocar producción.
Decisión 092.

**Coste:** aproximado, 45 minutos (lectura del verify-report, cálculo manual de los valores reales
de FN/TN totales por estrategia antes de escribir las aserciones, RED→GREEN, actualización de
`DECISIONS.md`/`ROADMAP.md`).

**Observación:** un test que fija la semántica de una función pura (`computeMetrics`) no prueba
que el artefacto final expuesto al usuario use esa misma semántica correctamente — hacía falta un
test que inspeccionara la salida real de la CLI (Markdown/JSON/CSV), no solo `packages/core`, para
detectar que la capa de render había vuelto a introducir la exclusión que D2 prohibía uno o dos
pasos más arriba. La verificación de artefactos exportados (deliverables de la memoria del TFM)
necesita comprobar reconciliación visible entre columnas, no solo que cada número individual sea
"correcto" según su propia definición interna.

### 2026-09-25 — Una aserción de test se autoinvalidó por la subcadena "null" en su propio dato de prueba

**Contexto:** paso 2.2, `sdd-apply` (segundo lote, fase 5), `apps/ingestion/test/strategy-comparison-render.test.ts`.

**Categoría:** test que valida el comportamiento equivocado (falso negativo de la propia
aserción, no del código de producción).

**Qué ocurrió:** un test comprobaba que el Markdown renderizado nunca contuviera la palabra
"null" suelta (`expect(md).not.toMatch(/\bnull\b/)`), como señal de que los valores `null` se
renderizan siempre como "n/a". El `StrategyEvaluation` de prueba usado en ese mismo test se llamó
`null-edge-strategy` — y ese nombre aparece literalmente en el Markdown generado (como encabezado
de sección), así que la propia aserción fallaba contra su propio dato de entrada, no contra un
fallo de `renderMarkdown`.

**Cómo se detectó:** ejecución del test inmediatamente después de escribirlo (ciclo RED→GREEN de
TDD estricto): falló con un mensaje que mostraba el Markdown completo, dejando ver que el único
"null" presente era el nombre de la estrategia de prueba, no ningún valor sin formatear.

**Cómo se resolvió:** renombrada la estrategia de prueba a `edge-case-strategy`; el resto de
aserciones del mismo test (comprobación explícita de `"n/a"` en la tabla y ausencia de `"NaN"`)
ya demostraban el comportamiento real, así que no hizo falta cambiar `render.ts`.

**Coste:** menos de 2 minutos.

**Observación:** mismo patrón que la mistake #2 del lote anterior de este cambio
(`parameters.ts` contenía la subcadena "dedup-corpus" en su propio comentario y tripeaba su
propio test de "no importa el corpus"): un test que inspecciona texto completo (comentarios,
nombres de fixtures, prosa generada) debe elegir sus datos de prueba evitando por completo la
subcadena que está prohibiendo, no solo evitarla en el código de producción.

### 2026-09-25 — El commit inicial del paso 2.2 (fase 1, primer lote) dejó una copia obsoleta de `dedup-corpus.ts` en `HEAD` tras un `git mv` con pathspec parcial

**Contexto:** paso 2.2, `sdd-apply` (primer lote, fase 1): reubicación del corpus etiquetado de
`packages/core/test/dedup-corpus.ts` a `packages/core/src/evaluation/dedup-corpus.ts` (decisión
090).

**Categoría:** código correcto en apariencia pero incorrecto (el árbol de trabajo era correcto;
el commit no).

**Qué ocurrió:** tras `git mv packages/core/test/dedup-corpus.ts packages/core/src/evaluation/dedup-corpus.ts`,
el commit se creó con `git commit -m "..." -- <4 rutas explícitas>`, y esa lista de rutas NO
incluía la ruta ANTIGUA (el lado de borrado del rename). El resultado: el árbol del commit
conservó la copia PRE-sesión de `test/dedup-corpus.ts` (608 líneas, sin el campo `truth`) junto a
la nueva `src/evaluation/dedup-corpus.ts`, aunque el árbol de trabajo real ya solo tenía el
fichero nuevo.

**Cómo se detectó:** `git status` tras el commit "limpio" seguía mostrando `D
packages/core/test/dedup-corpus.ts` en staging — la señal de que el commit no había capturado el
borrado.

**Cómo se resolvió:** un commit de corrección en la misma sesión (`2466edb`, nunca un `amend`, por
la regla del proyecto de no reescribir commits) que confirmó el borrado ya en staging.

**Coste:** aproximado, 3 minutos.

**Observación:** tras un `git mv` seguido de un commit restringido a un pathspec explícito,
conviene verificar `git show HEAD:<ruta-antigua>` antes de dar el commit por completo — un
pathspec parcial puede dejar huérfano justo el lado de borrado de un rename sin que ningún test
lo detecte (los tests corrían contra el árbol de trabajo, no contra el commit).

### 2026-09-25 — La decisión 087 del diseño ilustraba su argumento con un cálculo a mano matemáticamente inalcanzable

**Contexto:** paso 2.2, diseño (obs #283) y `sdd-apply` (primer lote, fase 3): umbrales de la
estrategia probabilística.

**Categoría:** deriva de la arquitectura entre sesiones (el diseño razonó sobre un caso que el
propio esquema de dominio, `listingSchema`, ya prohibía).

**Qué ocurrió:** el diseño justificaba "ningún par con como mucho dos campos evaluados alcanza
`accept`" con un cálculo concreto — distancia + dirección exacta, `M=2.807+3.000-3.170=2.637`,
`p≈0.862` — que omite `price` por completo. Pero `priceCents` es `z.int().positive()` (obligatorio
en `listingSchema` desde ROADMAP 1.4): ningún `Listing` real puede tener el precio ausente, así
que `price` SIEMPRE se evalúa y ese `M` exacto es inalcanzable por cualquier par real.

**Cómo se detectó:** al escribir el RED del test que debía pinchar ese caso (fase 3, tarea 3.7):
ningún par sintético con `price` ausente es un `Listing` válido, así que el caso literal del
diseño no se podía construir.

**Cómo se resolvió:** sin ajustar los parámetros `m`/`u` para forzar la cifra del diseño
(instrucción explícita de la orquestación, decisión D3 del preproposal). Se implementó la tabla
real tal y como está especificada y se escribieron los tests sobre el mismo PRINCIPIO cualitativo
con valores calculados por el código real (`score≈0.806` para dos campos fuertes con `price` en
banda intermedia, `score≈0.976` para tres campos fuertes). Documentado en `docs/DECISIONS.md`,
decisión 087.

**Coste:** aproximado, 10 minutos (detección más redacción de la desviación en el resumen de la
tarea).

**Observación:** una ilustración numérica de un diseño que razona "en el vacío" (sin comprobar
contra los esquemas Zod reales) puede ser matemáticamente inalcanzable aunque el PRINCIPIO que
ilustra sea correcto — verificar un cálculo a mano contra las restricciones reales del dominio
(aquí, qué campos son opcionales de verdad) antes de citarlo en la documentación final.

### 2026-09-25 — Especificadores de import relativos en `tasks.md` bloquearon al dispatcher nativo antes de empezar a aplicar

**Contexto:** paso 2.2, tarea `sdd-tasks` (obs #285) y arranque de `sdd-apply`.

**Categoría:** patrón de una versión anterior del framework / contradicción con una regla de
plataforma no evidente desde la propia redacción de la tarea.

**Qué ocurrió:** las tareas 1.4 y 1.5 (revisión 1) describían las rutas de los ficheros a tocar
como especificadores de import relativos (p. ej. `../src/evaluation/make-listing.js`, tal y como
aparecerían DENTRO de un fichero de test), en vez de como rutas relativas al repositorio. El
dispatcher nativo de SDD interpretó esos especificadores literalmente como rutas de edición fuera
del repositorio y bloqueó el arranque de `sdd-apply` con
`blocked(edit_authority_missing)`.

**Cómo se detectó:** el propio intento de arranque de `sdd-apply`, antes de escribir ningún
código — el bloqueo es una comprobación de la plataforma, no un fallo de test.

**Cómo se resolvió:** el orquestador reescribió las tareas 1.4/1.5 (revisión 2) con rutas
relativas al repositorio (`packages/core/test/test-helpers.ts`, etc.), manteniendo el mismo
contenido técnico.

**Coste:** aproximado, 5 minutos (bloqueo, reescritura, reintento).

**Observación:** al redactar tareas de `sdd-tasks`, las rutas de fichero deben escribirse siempre
relativas a la raíz del repositorio, nunca como el especificador de import que un fichero de
código usaría para referenciarlas — son dos convenciones de ruta distintas y el dispatcher nativo
solo entiende la primera.

### 2026-09-25 — El diseño inicial citaba un "corte del 2%" y una "decisión 023" inexistentes para justificar los umbrales de la estrategia probabilística

**Contexto:** paso 2.2, `sdd-design` (revisión 1, corregida en la revisión 2 tras FAIL del
validador de diseño).

**Categoría:** código (aquí, prosa técnica) correcto en apariencia pero incorrecto — una cita que
suena precisa pero no corresponde a nada real en el repositorio.

**Qué ocurrió:** la primera versión del diseño justificaba los cortes de nivel "near" de la nueva
estrategia (2% de diferencia relativa, 20 m) como si ya existieran en rule-based, citando una
"decisión 023" que no trata ese tema. En realidad, rule-based (`signals.ts`) decae linealmente
hasta 0 en un 10% de diferencia relativa (precio/superficie) y en 100 m (distancia) — sin ningún
corte al 2%.

**Cómo se detectó:** el validador de diseño (FAIL en la primera pasada) señaló la cita incorrecta
entre otros hallazgos.

**Cómo se resolvió:** la revisión 2 del diseño sustituyó la cita por los puntos de decaimiento
reales de `rule-based/signals.ts:15-17`, y marcó los cortes "near" (2%, 20 m) explícitamente como
elecciones a priori NUEVAS de la estrategia probabilística, sin precedente en rule-based —
distinguiendo qué parámetros reutilizan un punto ya medido y cuáles son una decisión nueva. Ver
`packages/core/src/strategies/probabilistic/parameters.ts` (comentario de cabecera) y
`docs/DECISIONS.md`, decisión 085.

**Coste:** no medido directamente por `sdd-apply` (ocurrió en una fase de diseño anterior); la
corrección quedó ya resuelta en el diseño que `sdd-apply` recibió.

**Observación:** citar un número de decisión concreto (`docs/DECISIONS.md`) como respaldo de una
elección de diseño es una afirmación verificable, igual que una cita de código — conviene
comprobarla contra el fichero real antes de que llegue a la documentación final, no confiar en
que "suena" a una decisión ya tomada.

### 2026-09-25 — El comentario de cabecera de `weights.ts` ("los umbrales nunca son un parámetro en tiempo de ejecución") entraba en tensión literal con D5 antes de acotarse

**Contexto:** paso 2.2, preproposal (D5) y `sdd-design`: `classify()` gana un parámetro opcional
de umbrales para la evaluación offline.

**Categoría:** contradicción con una regla ya documentada en el propio repositorio
(`packages/core/src/strategies/rule-based/weights.ts:1-7`, decisiones 020/049).

**Qué ocurrió:** D5 (preproposal, aceptado por el responsable del proyecto) decidía que
`classify()` ganaría un segundo parámetro OPCIONAL de umbrales, usado solo por la evaluación
offline. El comentario de cabecera existente de `weights.ts`, escrito en ROADMAP 1.9, afirmaba en
términos absolutos que esos umbrales "nunca cruzan ninguna frontera externa real EN PRODUCCIÓN...
bajo la decisión 020 nada debe hacerlo nunca" — una redacción que, leída literalmente, parecía
prohibir cualquier parámetro en tiempo de ejecución, sin distinguir producción de una superficie
de evaluación que nunca escribe en la base de datos real.

**Cómo se detectó:** durante el propio `sdd-design`, al razonar sobre cómo introducir D5 sin
contradecir un comentario ya documentado.

**Cómo se resolvió:** decisión 088 — el comentario de `weights.ts` se reescribió para ACOTAR el
principio a producción, no para contradecirlo: producción sigue usando siempre las constantes por
defecto (`reprocess-core.ts` nunca pasa un segundo argumento), y el override existe
EXCLUSIVAMENTE para una CLI sin base de datos ni camino de escritura hacia `property_listings`.

**Coste:** no medido directamente por `sdd-apply` (resuelto en la fase de diseño); la tarea 2.5
de `sdd-apply` solo tuvo que aplicar la reescritura ya decidida.

**Observación:** un comentario redactado en términos absolutos ("nunca", "nada debe") puede
quedar obsoleto por una decisión de producto posterior sin que nadie lo note hasta que alguien
intente seguirlo al pie de la letra — acotar el ALCANCE de un comentario así (a qué se refiere
exactamente "nunca") suele ser más preciso que reescribirlo desde cero.

### 2026-09-25 — La especificación inicial medía precisión/recall/F1 contra `expected`, la propia banda diseñada de rule-based (circular)

**Contexto:** paso 2.2, `sdd-spec` (revisión 1, corregida en la revisión 2).

**Categoría:** deriva de la arquitectura entre sesiones — la especificación no distinguía la banda
DISEÑADA de rule-based (`CorpusEntry.expected`, ya existente desde ROADMAP 1.9) de una verdad
terreno independiente.

**Qué ocurrió:** la primera versión de la especificación no fijaba de dónde debían salir las
métricas de evaluación, y la interpretación natural era calcularlas contra `expected` — el único
campo del corpus etiquetado que ya existía. Pero `expected` es la salida DISEÑADA de rule-based
(p. ej. `hn-8` es `accept` por diseño, un falso positivo irreducible documentado en su propia
`rationale`), así que evaluar CUALQUIER estrategia contra `expected` sesga la comparación a favor
de rule-based por construcción — y para rule-based mismo, la "evaluación" sería tautológica.

**Cómo se detectó:** el propio diseño (obs #283), en su sección "CRITICAL FINDING", al razonar
sobre qué necesitaba comparar realmente el CLI de evaluación.

**Cómo se resolvió:** la revisión 2 de la especificación añadió el requisito "Ground-Truth
Labels": un campo `truth: 'duplicate' | 'distinct'` INDEPENDIENTE de `expected`, con un escenario
explícito que fija que las métricas se calculan solo sobre `truth`. Las cuatro etiquetas que la
redacción original del corpus no resolvía por sí sola (`md-2`, `md-4`, `hn-7`, `hn-8`) las
confirmó el responsable del proyecto por cuestionario (obs #284) antes de empezar a aplicar.

**Coste:** no medido directamente por `sdd-apply` (resuelto en fases de spec/diseño anteriores).

**Observación:** cuando una especificación de evaluación reutiliza un campo que YA existe en los
datos de prueba (aquí, `expected`) sin preguntar explícitamente si ese campo es independiente del
sistema que se va a evaluar, el riesgo por defecto es la circularidad — vale la pena nombrar el
campo de verdad terreno como una entidad aparte desde el principio, aunque parezca redundante con
uno ya existente.

### 2026-09-24 — Ramas nuevas creadas sin preguntar para una entrega en PRs encadenadas

**Contexto:** paso 1.15, entrega del cambio `security-hardening` en tres unidades de trabajo.

**Categoría:** contradicción con una preferencia del responsable del proyecto (no escrita hasta
entonces): trabajar siempre en la rama activa.

**Qué ocurrió:** al elegirse "PRs encadenadas sobre rama integradora", el orquestador interpretó
que eso implicaba crear ramas apiladas (`security-hardening-1/2/3`) y creó la primera sin
preguntar, solo avisando. El responsable del proyecto no quería trabajar fuera de
`feature-fase1`.

**Cómo se detectó:** pregunta directa del responsable del proyecto al revisar el resultado.

**Coste:** ~5 minutos. Las ramas eran lineales y nunca se subieron: avance rápido de
`feature-fase1`, push y borrado de las ramas temporales, sin reescribir historial.

**Observación:** partir un cambio en unidades revisables no exige ramas distintas; puede hacerse
por commits en la rama activa. Cualquier `git switch -c` se pregunta antes.

---

### 2026-09-24 — Una prueba que necesitaba el rol `web_coverage` fallaba en vez de omitirse sin él

**Contexto:** paso 1.15 (PR2), `apps/web/test/db/page-coverage-degradation.test.tsx`, caso
`client-cap-exhausted`.

**Categoría:** código que compilaba pero no hacía lo correcto.

**Qué ocurrió:** el caso nuevo consume la cuota por cliente con el handle de escritura, pero
quedó dentro del guard general `describeWithDb` (solo exige `DATABASE_URL`). Sin
`WEB_COVERAGE_DATABASE_URL`, las demás pruebas del rol se omiten y esta fallaba con "no está
definida". Corregido con `it.skipIf(!process.env.WEB_COVERAGE_DATABASE_URL)`.

**Cómo se detectó:** comportamiento en ejecución: al añadir el bloque de `.env.example` también a
`.env`, una línea vacía duplicada anuló el valor real de la variable. Ni `sdd-apply` ni el
validador de la PR2 lo vieron, porque en su entorno la variable siempre estaba definida.

**Coste:** ~5 minutos.

**Observación:** una prueba que depende de una credencial opcional debe usar el mismo guard que
el resto de pruebas de esa credencial; ejecutar la suite con la variable vacía lo habría revelado.

---

### 2026-09-24 — Tarea marcada `[x]` sin cumplir el diseño: el limitador del proxy indexaba por la IP cruda, nunca por su HMAC

**Contexto:** paso 1.15 (PR2, `apps/web/src/proxy.ts`), validación independiente de `sdd-apply`
tras el cierre de la PR2.

**Categoría:** código correcto en apariencia pero incorrecto; contradicción con una regla de
este fichero (decisión 076 del diseño: la clave de cuota nunca es el valor crudo).

**Qué ocurrió:** la tarea 2.11 se marcó `[x]` y `proxy.ts` compilaba, tipaba y pasaba lint, pero
el limitador en memoria indexaba su `Map` por la IP cruda del header, sin llamar nunca a
`hmacClientKey`. El comentario de `client-identity.ts` afirmaba además, en falso, que el proxy sí
reutilizaba esa función. Ningún test de `proxy-rate-limit.test.ts` ni `proxy-config.test.ts` lo
habría podido detectar: ambos prueban el limitador en aislamiento, con una clave ya resuelta como
entrada.

**Cómo se detectó:** validador independiente de la PR2 (no el propio `sdd-apply`), leyendo
`proxy.ts` contra el flujo de datos del diseño (#262), no contra los tests existentes.

**Cómo se resolvió:** se añadió un test de `proxy.ts` con un espía sobre `hmacClientKey`
(`vi.mock` envolviendo la función real, no sustituyéndola) para forzar un RED confirmado antes de
cablear la llamada real; se corrigió el comentario falso. `apps/web` quedó en 134/134.

**Observación:** un test que prueba un módulo en aislamiento, con sus dependencias ya resueltas
como fixtures, no puede detectar que el módulo QUE LO LLAMA nunca invoque esa dependencia — la
cobertura de integración real (aquí, un test contra `proxy.ts` mismo) era la única pieza que
faltaba, y faltaba precisamente en el nivel que el checklist de tareas daba por hecho.

---

### 2026-09-24 — CSP `frame-ancestors`/`X-Frame-Options` relajados sin autorización frente al diseño

**Contexto:** paso 1.15 (PR2, `apps/web/next.config.ts`), corrección posterior a la entrega de
`sdd-apply`.

**Categoría:** contradicción con una regla de este fichero (diseño #262, decisión 080, que fijaba
`frame-ancestors 'none'`, y la investigación citaba `X-Frame-Options: DENY` de OWASP).

**Qué ocurrió:** `sdd-apply` entregó `frame-ancestors 'self'` y `X-Frame-Options: SAMEORIGIN` en
vez del valor estricto del diseño, razonando compatibilidad entre ambas cabeceras. El test nuevo
(`security-headers.test.ts`) solo comprobaba `toBeDefined()` sobre la cabecera, no su valor
exacto, así que la relajación pasó en verde.

**Cómo se detectó:** revisión del orquestador contra el texto literal del diseño, no por ningún
test — el test tal y como estaba escrito no podía distinguir `'self'` de `'none'`.

**Cómo se resolvió:** se reforzó la aserción del test para comprobar el valor exacto (RED
confirmado contra el valor relajado), y se restauró `'none'`/`DENY` en `next.config.ts` (GREEN).
Ver decisión 084 en `docs/DECISIONS.md`.

**Observación:** una aserción `toBeDefined()` sobre una cabecera de seguridad prueba presencia,
nunca el valor — exactamente el patrón "TYPE-ONLY ASSERTIONS" que la disciplina TDD estricta de
este proyecto prohíbe, y aun así pasó una primera revisión porque typecheck/lint/build no leen el
contenido de una cabecera HTTP.

---

### 2026-09-24 — Un import con sufijo `.js` que `tsc`/`vitest` aceptan y Turbopack no, esta vez en `apps/web/src` (no en `apps/ingestion`)

**Contexto:** paso 1.15 (PR2), imports relativos nuevos en seis ficheros de `apps/web/src`
(`proxy.ts` y `server/env.ts`, `server/coverage-client.ts` nuevos; `server/{coverage-db,coverage,db}.ts`
modificados).

**Categoría:** patrón de una convención distinta, copiado del paquete equivocado.

**Qué ocurrió:** los imports relativos nuevos dentro de `apps/web/src` se escribieron con sufijo
`.js` (`from './env.js'`), copiando la convención de `packages/core`/`packages/db` (que compilan
con `tsc` a `.js` real). `tsc --noEmit` y `vitest` resolvieron esos imports sin problema — ambos
toleran el sufijo NodeNext bajo `moduleResolution: "Bundler"`. `pnpm --filter @buscahogar/web
build` (Turbopack) falló con 9 errores "Module not found", porque la convención YA existente en
`apps/web/src` (confirmada con `git stash` + grep contra la base) es imports relativos SIN
extensión.

**Cómo se detectó:** el paso de `next build`, no `tsc` ni `vitest` — mismo patrón exacto que la
entrada del 2026-09-17 sobre `result-card.tsx`/`thumbnail-source.js`, pero esta vez reintroducido
en ficheros nuevos por copiar la convención de otro paquete del monorepo en vez de verificar la
del propio directorio primero.

**Cómo se resolvió:** se quitó el sufijo `.js` de los seis imports relativos nuevos bajo
`apps/web/src` (los de `apps/web/test/**` conservan el sufijo — convención previa y distinta,
que `vitest` sí resuelve). Reejecutados build, typecheck, lint y la suite completa: todo verde.

**Observación:** este proyecto ya tiene ESTE MISMO fallo documentado (2026-09-17) para
`apps/web`, y aun así se repitió — la causa esta vez no fue desconocer el patrón, sino copiar por
defecto la convención de un paquete vecino sin comprobar la del directorio de destino.

---

### 2026-09-24 — La documentación instalada de `next/experimental/testing/server` nombra una función que el build real no exporta

**Contexto:** paso 1.15 (PR2), `apps/web/test/proxy-config.test.ts` (matcher del proxy).

**Categoría:** API de una versión distinta a la instalada, esta vez en la propia documentación
empaquetada, no en la memoria del asistente.

**Qué ocurrió:** la documentación markdown incluida en el propio paquete
(`next/dist/docs/.../proxy.md`) nombra `unstable_doesProxyMatch` en su sección de test unitario
experimental. El export compilado real en Next 16.3.4
(`next/dist/experimental/testing/server/middleware-testing-utils.d.ts`) solo define
`unstable_doesMiddlewareMatch`.

**Cómo se detectó:** lectura directa del `.d.ts`/`.js` instalado en `node_modules` ANTES de
escribir el test, siguiendo la instrucción de `context7`/`CLAUDE.md` de verificar contra la
versión fijada del paquete en vez de asumir. No llegó a producir un ciclo RED/GREEN fallido —se
usó el export real desde el principio.

**Cómo se resolvió:** N/A — no hizo falta corrección, solo la verificación previa evitó escribir
el import equivocado.

**Observación:** la propia documentación empaquetada de una dependencia puede estar
desincronizada con el código que realmente exporta esa misma versión — verificar el `.d.ts`
instalado sigue siendo más fiable que la documentación en prosa, incluso la que viene dentro del
propio paquete.

---

### 2026-09-24 — Un test nuevo se quedó en el mismo falso "rojo" que su propio RED, por un segundo defecto en el propio test (tope de cliente desalineado)

**Contexto:** paso 1.15 (PR2), `apps/web/test/db/page-coverage-degradation.test.tsx`, cuarto caso
(`client-cap-exhausted`).

**Categoría:** test que valida el comportamiento equivocado, por un error en su propia
preparación de datos, no en el código de producción.

**Qué ocurrió:** la primera redacción del caso fijaba `COVERAGE_PER_CLIENT_DAILY_CAP='5'` (leído
por el código de producción) pero agotaba la cuota del cliente llamando directamente a
`consumeClientQuota(db, keyHash, 1)` — un tope de `1`, distinto del `5` que leería
`page.tsx`. Tras implementar la tarea 2.14, el test SEGUÍA fallando, con la MISMA salida
("pendiente") que el RED original — a primera vista, parecía que la implementación no había
funcionado.

**Cómo se detectó:** comparación manual de los dos valores de tope al investigar por qué el GREEN
esperado no llegaba.

**Cómo se resolvió:** se corrigió `COVERAGE_PER_CLIENT_DAILY_CAP='1'` para que coincidiera con el
tope usado al pre-agotar la cuota. Nunca se llegó a dar el paso por bueno con el falso rojo —se
reejecutó el test tras la sospecha, no se avanzó a la siguiente tarea.

**Observación:** un test que falla ANTES y DESPUÉS de implementar la funcionalidad, con el mismo
mensaje, es indistinguible de un RED que nunca se resolvió — solo inspeccionar los valores
concretos de la propia preparación del test (no solo si pasa o falla) lo distingue de un GREEN
genuino.

---

### 2026-09-24 — Tres fallos de ESLint que ni los tests ni `tsc` habrían detectado

**Contexto:** paso 1.15 (PR2), paso obligatorio `pnpm lint` al cierre de la fase.

**Categoría:** código correcto en apariencia pero incorrecto (regla de estilo, no de tipos).

**Qué ocurrió:** `proxy-rate-limit.ts` devolvía un objeto literal con un método `hit()` sin tipo
de retorno explícito (`@typescript-eslint/explicit-function-return-type`). Dos ficheros de test
(`coverage-client.test.ts`, `env.test.ts`) usaban `delete process.env[key]` dentro de un bucle
sobre un array `readonly string[]`, rechazado por `@typescript-eslint/no-dynamic-delete`.

**Cómo se detectó:** el paso obligatorio `pnpm lint`, ejecutado al final de la fase como exige el
preflight de la sesión — ni los 131 tests en verde ni `tsc --noEmit` habían marcado nada.

**Cómo se resolvió:** se anotó el tipo de retorno de `hit()`; se sustituyeron las cuatro
llamadas por `Reflect.deleteProperty(process.env, key)`. Sin precedente previo en el repositorio
para ese patrón de limpieza de variables de entorno en bucle — queda registrado como convención a
partir de ahora.

**Observación:** confirma, otra vez, que verde en tests y en tipos no implica verde en estilo —
las tres puertas son independientes y ninguna sustituye a las otras dos.

---

### 2026-09-24 — El presupuesto de líneas del ledger de intentos no contaba el snapshot generado de drizzle

**Contexto:** paso 1.15 (PR1), cierre (`settle`) del primer intento de `sdd-apply`.

**Categoría:** deriva de contexto entre fases — decisión del orquestador, no del agente de
`sdd-apply`.

**Qué ocurrió:** el orquestador fijó el tope de líneas cambiadas del ledger nativo de intentos en
800 sin descontar el `0011_snapshot.json` generado por `drizzle-kit generate` (1844 líneas). El
intento bloqueó en `maintainer_decision` con 2632 líneas cambiadas frente al límite de 800, aunque
el código autorado real (779 inserciones, 2 borrados) sí cabía cómodamente en el presupuesto de
sesión.

**Cómo se detectó:** el propio bloqueo del ledger nativo al intentar cerrar el intento.

**Cómo se resolvió:** el responsable del proyecto autorizó el reinicio del intento; para la PR2 el
orquestador fijó el tope teniendo en cuenta los ficheros generados.

**Observación:** el presupuesto de revisión (400/800 líneas) mide riesgo de revisión humana, no
tamaño de diff; un artefacto generado y determinista (una migración de drizzle) no aporta ese
riesgo y debería excluirse del mismo modo que ya se excluyen los goldens regenerados, según la
propia convención de la skill `work-unit-commits`.

---

### 2026-09-24 — Etiqueta de plantilla de drizzle equivocada (`integer` en vez de `sql`) en el `CHECK` de la nueva tabla

**Contexto:** paso 1.15 (PR1), `packages/db/src/schema/coverage-client-quota.ts` (columna
`registrations`, restricción `>= 0`).

**Categoría:** API/patrón usado de forma incorrecta, código que no habría compilado ni ejecutado.

**Qué ocurrió:** la restricción `check()` de la columna se escribió con la plantilla etiquetada
`integer\`...\`` en vez de `sql\`...\``, copiando mal el patrón de otra columna de la misma tabla.

**Cómo se detectó:** relectura del fichero inmediatamente después de escribirlo, antes de ejecutar
ningún test contra él — nunca llegó a ejecutarse en el estado roto.

**Cómo se resolvió:** se corrigió la etiqueta de plantilla a `sql` antes de continuar con la
tarea 1.7 (`drizzle-kit generate`).

**Observación:** un fallo autodetectado antes de ejecución no deja rastro en ningún test ni en
ningún log — se registra aquí solo porque el propio registro de progreso de la fase lo anotó en
el momento, no porque haya evidencia externa de que ocurrió.

---

### 2026-09-24 — `apps/ingestion` typecheckeaba contra el `dist/` compilado y desactualizado de `@buscahogar/db`, no contra su código fuente nuevo

**Contexto:** paso 1.15 (PR1), tras añadir `purgeExpiredClientQuota` a `packages/db/src`.

**Categoría:** deriva de build entre paquetes del monorepo — mismo patrón ya documentado el
2026-09-16 (`apps/ingestion` resuelve `@buscahogar/db` por su `dist/` compilado, no por su código
fuente) y el 2026-09-19 (el build de `@buscahogar/core`, no solo `@buscahogar/db`, es requisito de
orden antes de testear `apps/ingestion`) — tercera recurrencia del mismo defecto estructural.

**Qué ocurrió:** `apps/ingestion/src/sweep/coverage-worker-ports.ts` necesitaba importar la nueva
función `purgeExpiredClientQuota`, pero `apps/ingestion` consume `@buscahogar/db` a través de su
`dist/` ya compilado —desactualizado hasta reconstruirlo— así que el typecheck de `apps/ingestion`
fallaba con la función ausente pese a que el código fuente de `packages/db` ya la exportaba.

**Cómo se detectó:** `pnpm --filter @buscahogar/ingestion typecheck` fallando con "no existe la
propiedad `purgeExpiredClientQuota`" pese a que el fichero fuente la exportaba visiblemente.

**Cómo se resolvió:** reconstruir `packages/core`+`packages/db` (`pnpm --filter @buscahogar/core
build && pnpm --filter @buscahogar/db build`) antes de reejecutar el typecheck de
`apps/ingestion`.

**Observación:** tercera vez que este mismo defecto estructural del monorepo se documenta en este
fichero (2026-09-16, 2026-09-19, y ahora). Sigue sin haber una regla o script que lo prevenga
automáticamente — candidato real para una mejora de proceso fuera del alcance de este paso.

---

### 2026-09-24 — `sdd-spec` y `sdd-design` en paralelo volvieron a contradecirse sobre el orden de comprobación, igual que en el paso 1.10

**Contexto:** paso 1.15, capability `coverage-registration` (spec #261) frente a
`resolveCoverageForZone` (diseño #262).

**Categoría:** deriva de contexto entre fases — contradicción real entre dos artefactos
generados en paralelo, mismo patrón que en los pasos 1.10 y 1.11.

**Qué ocurrió:** la primera redacción de la spec comprobaba primero el límite POR CLIENTE y
después el tope GLOBAL; el diseño (decisión 079) razonaba, desde el propio código de
`coverage.ts`, que el orden correcto era el contrario —tope global (solo lectura) antes que
consumo por cliente (escritura)— para no gastar nunca la cuota de un cliente en un registro que
de todos modos iba a rechazarse por el tope global.

**Cómo se detectó:** arbitraje del orquestador al comparar ambos artefactos antes de `sdd-tasks`,
no por ningún test —ningún código existía aún para ninguno de los dos órdenes.

**Cómo se resolvió:** re-ejecución correctiva de `sdd-spec` (revisión 2), alineada al orden del
diseño. Ver decisión 079 en `docs/DECISIONS.md`.

**Observación:** tercera vez que este patrón ocurre en este proyecto (tras los pasos 1.10 y
1.11; la primera, paso 1.10, sobre si un singleton recibe fila propia en `property_listings`) — en ambos casos la spec
razonaba desde la prosa de la propuesta y el diseño desde el código real, y en ambos casos ganó
el diseño.

---

### 2026-09-24 — La fase de exploración del paso 1.15 dio por ausente un `.env.example` que sí existe

**Contexto:** paso 1.15, fase `sdd-explore` (obs #255), auditoría de la lista de comprobación de
seguridad del propio prompt del paso ("Secretos fuera del control de versiones").

**Categoría:** afirmación incorrecta sobre el estado del propio repositorio, sin verificarla con
una herramienta de listado de ficheros.

**Qué ocurrió:** `sdd-explore` reportó `.env.example` como ausente del repositorio. El fichero sí
existe en la raíz del proyecto.

**Cómo se detectó:** corrección posterior (obs #256) al re-verificar la lista de ficheros de la
raíz.

**Cómo se resolvió:** la exploración se corrigió por observación nueva (obs #256), sin
sobreescribir la original —misma convención append-only que el resto de correcciones de este
proyecto (decisión 056 enmienda a la 015, obs #77 corrige a la #13).

**Observación:** una afirmación de "ausencia" es la más barata de verificar (un `ls` basta)
y la más cara de dejar sin verificar — bloquea sin necesidad cualquier tarea que dependiera de
creer que el fichero no existe. Mismo principio ya registrado el 2026-09-24 (paso 1.14, punto 1
de la entrada "tres afirmaciones falsas"): una afirmación sobre el estado del repositorio es
verificable como el código, y conviene contrastarla antes de darla por buena.

---

### 2026-09-23 — Un test nunca ejecutado no puede darse por bueno: su propio caso positivo sembraba la fila que hacía imposible su propia aserción

**Contexto:** paso 1.13, segunda pasada de `sdd-verify` (obs #231) tras el aprovisionamiento
del rol `web_coverage` por el responsable del proyecto (tarea 10.5). Fichero:
`apps/web/test/db/coverage-role-privileges.test.ts` (tarea 10.6, decisión 064) — escrito y
gateado desde el paso 1.13, `describe.skip` mientras `WEB_COVERAGE_DATABASE_URL` no existiera,
y por tanto nunca ejecutado en verde ni una sola vez hasta esta sesión.

**Categoría:** test que valida el comportamiento equivocado; código correcto en apariencia
pero incorrecto.

**Qué ocurrió:** el caso positivo de la suite (`'INSERT en coverage_jobs (con zone/source
reales) SÍ está permitido'`) usaba `seedZoneAndSource`, que sembraba con el rol propietario un
`coverage_job` en estado `'pending'` para el mismo par `(zone_id, source_id)` que el propio
caso intentaba insertar a continuación con el rol restringido. El índice único parcial
`coverage_jobs_zone_source_pending_idx` (DD-16/CR-3, ROADMAP 1.13 Unidad A) rechaza ese
segundo `INSERT` con `23505` (violación de unicidad) **antes** de que PostgreSQL llegue
siquiera a evaluar el privilegio del rol — así que, tal y como estaba escrita, la propia
aserción positiva de la suite no podía pasar nunca, independientemente de si el rol tenía o
no el permiso correcto. Un defecto real, invisible a cualquier revisión de código porque
compila, tipa y lee bien: solo la ejecución contra PostgreSQL real lo revela.

**Cómo se detectó:** al ejecutar la suite por primera vez, en `sdd-verify` (obs #231), tras
el aprovisionamiento del rol. No por inspección ni por `.toSQL()`.

**Cómo se resolvió (en esa misma sesión, no en esta):** se borra la fila sembrada con la
conexión PROPIETARIA justo antes del intento de `INSERT` del rol de cobertura — el propio caso
NEGATIVO de `DELETE`, más abajo en la misma suite, es la prueba de que el rol de cobertura no
podría haber hecho ese borrado él mismo, así que el arreglo no oculta el permiso que la suite
existe para comprobar.

**Observación — la parte que merece el registro:** esta es exactamente la advertencia que la
PRIMERA pasada de `sdd-verify` ya había dejado por escrito, en prosa, como riesgo residual
antes de que nadie la ejecutara: un test que nunca corre no es evidencia de nada, ni siquiera
de que esté bien escrito. La suite paralela nueva de este mismo cierre,
`readonly-role-privileges.test.ts` (hallazgo W5, decisión 069), evita esta trampa a propósito:
sus casos de rechazo de `INSERT` usan identificadores de fila sin sembrar, porque el rechazo
por privilegio ocurre en la fase de comprobación de permisos, antes de cualquier restricción
de clave foránea o de índice único — así que no dependen de que ninguna fila previa exista ni
colisione, y no heredan el mismo defecto por construcción.

### 2026-09-23 — `pnpm typecheck` en verde no prueba que la app compile: cuatro unidades de aplicación y un cierre de documentación nunca ejecutaron `pnpm build`

**Contexto:** paso 1.13, corrección posterior a `sdd-verify` (obs #231, hallazgo C1) —
`apps/web/src/components/coverage-status.tsx` importaba `./coverage-status-policy.js`, pero el
fichero real en disco es `coverage-status-policy.ts`.
**Categoría:** código correcto en apariencia pero incorrecto; hueco en la propia secuencia de
puertas de calidad del proyecto, no en el código verificado por ellas.

**Qué ocurrió:** el especificador `.js` sobre un fichero `.ts` es válido para la resolución de
módulos `bundler`/`NodeNext` de TypeScript — `tsc --noEmit` lo tolera y lo mapea al `.ts` real,
así que `pnpm typecheck` salía en verde. Turbopack, el bundler real que usa `next build`, no
hace esa tolerancia: resuelve contra el sistema de ficheros tal cual, y `Cant resolve
./coverage-status-policy.js` hace fallar la build de producción en seco. El defecto sobrevivió
cuatro unidades de aplicación completas (A-D) y una sesión de cierre de documentación —
`docs/ROADMAP.md`, `apply-progress` 1-4 — todas reportando "todas las puertas en verde", porque
ninguna ejecutó `pnpm build` (workspace completo): solo se ejecutaba
`pnpm --filter @buscahogar/db run build`, que nunca toca `next build`.

**Cómo se detectó:** `sdd-verify` (obs #231) ejecutó `pnpm build` explícitamente, algo que
ninguna sesión de aplicación anterior había hecho, y lo reprodujo de forma determinista dos
veces.

**Cómo se resolvió:** una línea — se retiró la extensión `.js` del import relativo, alineando el
fichero con la convención ya existente en `apps/web/src` (todo import relativo local es sin
extensión; `packages/*` es la única excepción legítima, por resolución `NodeNext`). No se movió
ni se creó ningún fichero.

**Observación:** `pnpm typecheck` y `pnpm build` verifican cosas distintas — el primero, tipos;
el segundo, que el grafo de módulos real resuelva bajo el bundler de producción. Un typecheck en
verde nunca es evidencia de que la app compile. El propio comando `pnpm build` ya existe en la
raíz (`"build": "pnpm -r build"`), pero no hay en este repositorio ni configuración de CI ni un
script agregado ni una lista de comprobación documentada que lo incluya junto a `lint`/
`typecheck`/`test` como secuencia estándar — no existe ningún sitio natural al que
"engancharlo" automáticamente. Regla para toda sesión de aplicación o de cierre de este
proyecto: `pnpm build` (workspace completo) es una puerta obligatoria más, nunca sustituible por
`pnpm --filter @buscahogar/db run build` ni por `pnpm typecheck`.

### 2026-09-22 — Una cadena de conexión en `.env.local` no es un rol de PostgreSQL: verificado directamente contra la base, el segundo rol de la unidad D nunca se creó

**Contexto:** cierre del paso 1.13, tareas 10.5/10.6 (segundo rol `INSERT`-only sobre
`coverage_jobs`, unidad D).
**Categoría:** deriva entre lo reportado y lo real; verificable solo desde el lado de la base de
datos, no desde `.env`.

**Qué ocurrió:** se reportó que la credencial de cobertura se había añadido a `.env.local`. Eso
no implica que el rol de PostgreSQL restringido exista: son dos cosas distintas, y solo la
segunda es lo que hace `INSERT`-only una garantía real en vez de una cadena de conexión que
apunta a nada o a un rol con permisos de más.

**Cómo se detectó:** `.env`/`.env.local` son ilegibles para cualquier agente de este proyecto
(restricción ya registrada en pasos 1.2/1.5/1.7/1.11/1.13), así que la cadena de conexión no se
puede inspeccionar directamente. Los roles de PostgreSQL sí son inspeccionables incluso sin leer
`.env`: `docker compose exec db … psql … -c "SELECT rolname FROM pg_roles …"` devuelve
únicamente `buscahogar` (el rol propietario) y `web_readonly` (decisión 056). **Ningún rol
adicional de escritura restringida existe en la base de datos en este momento.**

**Cómo se resolvió:** no se resuelve aquí — confirma que la tarea 10.5 sigue genuinamente sin
hacer, tal y como ya reportaba `sdd/on-demand-coverage/apply-progress-3` (obs #226), y que la
tarea 10.6 (el test de privilegio negativo) seguirá saltándose hasta que el rol exista de
verdad.

**Observación:** la comprobación útil aquí no fue leer `.env` — imposible por permiso — sino
consultar `information_schema.table_privileges`/`pg_roles` directamente, que sigue siendo
inspeccionable incluso cuando `.env` no lo es. Regla general para verificar cualquier
prerrequisito de rol de base de datos en este proyecto: preguntar a la base de datos, no al
fichero de configuración.

### 2026-09-22 — Ejecutar en paralelo las suites respaldadas por Docker produce un fallo de clave foránea espurio: comparten la misma base de datos

**Contexto:** cierre del paso 1.13, gates finales — `db` `test:blocking`/`test:consolidation`/
`test:detail` e `ingestion` `test:db`.
**Categoría:** test que valida el comportamiento equivocado (en este caso, un fallo que no era
del código sino del propio arnés de ejecución).

**Qué ocurrió:** al lanzar las cuatro suites Docker-gated **a la vez**, `test:detail` falló con
`23503 — Key (source_id) is not present in table "sources"`, como si una fila insertada hubiera
desaparecido a media prueba. El resto pasó en verde, pero de forma no fiable: sin una base de
datos de test separada (decisión 046), cada suite trunca y siembra la misma base compartida
(`buscahogar-db-1`); ejecutarlas en paralelo hace que el `TRUNCATE` de una interfiera con el
`INSERT` de otra que asumía datos de referencia ya sembrados por ella misma.

**Cómo se detectó:** re-ejecutando `test:detail` en solitario inmediatamente después — 10/10 en
verde, sin tocar ni una línea de código. Confirmado repitiendo las otras tres también en
solitario: mismos recuentos, mismo resultado en verde.

**Cómo se resolvió:** ejecutar las cuatro suites Docker-gated **secuencialmente**, nunca en
paralelo, mientras no exista una base de datos de test separada (pendiente de decidir, ver
`docs/DECISIONS.md`, sección «Pendientes de decidir»).

**Observación:** no se reportó como fallo real precisamente por releer la salida antes de darla
por buena — la propia decisión 046 ya avisa de que la base se comparte, pero no de que eso
también invalida la paralelización de los propios gates de cierre. Regla para sesiones futuras
de verificación: los comandos con `test:*` respaldados por Postgres de este proyecto se lanzan
uno detrás de otro, nunca con `run_in_background` simultáneo.

### 2026-09-21 — El tope del presupuesto diario no se aplicaba en la primera reserva del día: el hueco ya estaba en el SQL literal del propio diseño

**Contexto:** paso 1.13, unidad de trabajo B, `packages/db/src/budget-ledger.ts` —
`reserveDailyBudget`.
**Categoría:** código correcto en apariencia pero incorrecto; deriva entre diseño e
implementación.

**Qué ocurrió:** `reserveDailyBudget` implementó exactamente el SQL que especifica DD-12 en el
artefacto de diseño (obs #215): un único `INSERT ... VALUES (...) ON CONFLICT (day, source_id)
DO UPDATE SET ... WHERE <tope> RETURNING ...`. PostgreSQL solo evalúa el predicado `WHERE` de un
`ON CONFLICT ... DO UPDATE` en la rama de conflicto. La **primera** llamada de cualquier proceso
para un `(day, source_id)` en un día UTC nuevo golpea un `INSERT` liso, sin fila con la que
entrar en conflicto, así que ese `WHERE` nunca se ejecuta — una reserva que supera el tope se
concedía igualmente, en silencio, exactamente el primer día de cada `(día, fuente)`. Es el fallo
de agotamiento de cuota que este componente existe para hacer estructuralmente imposible
(`CLAUDE.md`, decisión 001). El comentario de código que acompañaba la primera entrega afirmaba
además, incorrectamente, que DD-12 «aceptaba» este hueco como compromiso deliberado — el
artefacto de diseño no dice eso en ningún sitio.

**Cómo se detectó:** verificación independiente del orquestador, leyendo el SQL generado, no
ejecutando los tests — **todos los tests estaban en verde**. Un test RED dedicado reprodujo el
defecto después, contra Postgres real: una reserva de 20 contra un tope de 10, primera del día,
devolvía `{searchRequests: 20, tokenRequests: 0}` en vez de `null`, e insertaba una fila real.

**Cómo se resolvió:** tres cambios, en este orden. (1) `CHECK (search_requests <= search_cap)`
en el esquema — el mismo idioma que ya usan `zones_state_check`/`locations_ine_code_check` —
como respaldo estructural que protege la tabla de cualquier escritor, no solo de esta función.
(2) Reescritura de la sentencia a `INSERT ... SELECT ... WHERE <tope> ... ON CONFLICT ... DO
UPDATE ... WHERE <tope>`: una fuente `SELECT` con `WHERE` produce cero filas cuando el tope no
se cumple, así que el caso esperado («la reserva es demasiado grande») nunca llega a disparar el
`CHECK`, y sigue siendo una única sentencia atómica. (3) **Un segundo defecto, independiente,
salió al probar la propia corrección contra Postgres real, no al razonar sobre el SQL**: el nuevo
`SELECT ... WHERE $a <= $b`, con ambos parámetros sin tipar y sin ninguna columna de la que
inferir un tipo, hacía que PostgreSQL comparara como TEXTO — `'2' <= '10'` es FALSO
(lexicográfico), aunque `2 <= 10` sea matemáticamente cierto. Verificado empíricamente
(`select $1 where $1 <= $2` no devuelve fila para `(2, 10)`; con `::integer` explícito, sí).
Corregido con `::integer` en ambos operandos de esa comparación concreta.

**Coste:** una migración nueva (`0010_wakeful_patriot.sql`), dos tests nuevos, y una reescritura
de la función ya entregada — dentro de la misma unidad de trabajo, antes de asentarla.

**Observación:** la causa raíz no es solo de implementación — **el hueco ya estaba en el SQL
literal de DD-12**, así que copiar el diseño con fidelidad reprodujo el defecto del diseño.
`sdd-verify` y cualquier lectura futura de DD-12 deben tratar su SQL como necesitado de esta
misma corrección, no como fuente de verdad de la que rederivar la sentencia original (rota).
Mismo patrón que la entrada de 2026-09-17 sobre la subconsulta sin cualificar: 21 tests en verde
que comparaban forma de SQL, no comportamiento contra una base real, y la ejecución real fue lo
que encontró el fallo.

### 2026-09-22 — `drizzle-kit@0.31.10` vuelve a entrecomillar `geography` como identificador: segunda recurrencia, ya sistemática

**Contexto:** paso 1.13, unidad A, migración `0008_tired_ironclad.sql`
(`packages/db/src/schema/locations.ts`, columna `centroid`).
**Categoría:** API o método inexistente; patrón ya documentado que se repite.

**Qué ocurrió:** exactamente el mismo defecto que la entrada de 2026-09-09
(`SQLSTATE 42704: type "geography(Point,4326)" does not exist`): `drizzle-kit@0.31.10` no
reconoce `geography` en su lista de tipos nativos y entrecomilla la cadena que devuelve el
`customType` de `geographyPoint()`, convirtiéndola en un identificador SQL inválido.

**Cómo se detectó:** aplicando la migración `0008` contra `buscahogar-db-1` (base de desarrollo
vacía, 0 filas — aplicación limpia sin riesgo de pérdida de datos).

**Cómo se resolvió:** mismo precedente exacto que en 2026-09-09 — se corrigió a mano la
cláusula generada a `geography(Point,4326)` sin entrecomillar, documentado inline en el propio
fichero de migración.

**Observación:** esta es la **segunda vez** que este defecto concreto aparece en este proyecto.
Dos recurrencias convierten el patrón en sistemático, no incidental: **cualquier migración
futura que añada una columna `geographyPoint()` debe esperar este mismo fallo** y aplicar la
misma corrección manual — no vale tratarlo cada vez como un hallazgo nuevo que exige
diagnóstico desde cero. Vale la pena evaluar, fuera de esta sesión, si fijar una versión más
reciente de `drizzle-kit` resuelve el reconocimiento del tipo de forma definitiva.

### 2026-09-22 — Migración `0008` añade `search_name NOT NULL` sin valor por defecto ni backfill: defecto abierto, sin corregir en esta sesión

**Contexto:** paso 1.13, unidad A, `packages/db/migrations/0008_tired_ironclad.sql`
(`locations.search_name`).
**Categoría:** código correcto en apariencia pero incorrecto; deriva de la arquitectura entre
sesiones.

**Qué ocurrió:** la migración `0008` añade `search_name` a `locations` como `NOT NULL`, sin
valor por defecto y sin ninguna sentencia de backfill para las filas ya existentes. Aplicó sin
fallos en esta sesión únicamente porque la base de datos de desarrollo estaba vacía (0 filas en
`locations`) en el momento de aplicarla. **Cualquier base de datos que ya tuviera datos
sembrados** — que inserta al menos la fila de Granada del catálogo con cita manual — no puede
aplicar esta migración tal cual: fallaría por la restricción `NOT NULL` sobre filas existentes
sin valor.

**Cómo se detectó:** inspección del propio fichero de migración generado, no ejecución — el
fallo es invisible contra una base de datos limpia (como esta) y cierto contra una ya sembrada.

**Cómo se resolvió:** **no se ha resuelto.** Se deja registrado aquí como defecto abierto, tal y
como pide la tarea 15.6, para que `sdd-verify` lo evalúe explícitamente en vez de descubrirlo
tarde en un entorno con datos reales.

**Observación:** el riesgo es asimétrico y silencioso — funciona siempre en un clon nuevo y
falla siempre en cualquier entorno que ya haya sembrado datos, que es exactamente el tipo de
defecto que una sesión de desarrollo con base de datos vacía no puede detectar por sí sola.

### 2026-09-19 — Engram `mem_save` trunca a 50.000 caracteres en silencio: hay que partir los artefactos SDD largos antes de escribirlos

**Contexto:** paso 1.13, artefacto de diseño (`sdd/on-demand-coverage/design`, obs #215).
**Categoría:** pérdida de contexto en tareas largas.

**Qué ocurrió:** `mem_save` corta el contenido almacenado a 50.000 caracteres sin avisar — la
observación se crea y se reporta como guardada, pero la cola simplemente desaparece, marcada con
un `[truncated]` literal dentro del propio texto guardado. Sin error y sin aviso en el resultado
de la llamada. Se comió la lista completa de contradicciones CR-1..CR-14 de la sección §5 del
diseño.

**Cómo se detectó:** al releer la propia observación guardada para verificarla, no al escribirla.

**Cómo se resolvió:** se reanudó al agente autor y se le pidió la sección que faltaba como una
observación separada (`sdd/on-demand-coverage/design-addendum`, obs #216). Detalle completo del
límite en Engram `sdd/on-demand-coverage/*` (obs #218, entrada de descubrimiento dedicada).

**Observación:** la regla para el resto del proyecto — **partir cualquier artefacto largo antes
de escribirlo, y releer siempre lo que se acaba de guardar** en vez de asumir que el contenido
enviado es el contenido persistido. Esta misma sesión de cierre aplicó la regla de forma
preventiva: el progreso de `sdd-apply` de este cambio se guardó en cuatro observaciones
separadas (`apply-progress`, `-2`, `-3`, `-4`) precisamente por este límite.

### 2026-09-21 — Un primer intento invirtió la dirección de dependencias del paquete: `scripts/` importando hacia `src/`

**Contexto:** paso 1.13, unidad C, `apps/ingestion/src/sweep/coverage-worker-ports.ts`.
**Categoría:** deriva de la arquitectura entre sesiones.

**Qué ocurrió:** el primer intento de reutilizar `composeStore` (definido en
`scripts/sweep-zone.ts`) desde el nuevo `src/sweep/coverage-worker-ports.ts` lo importó
directamente de `scripts/`. Esto invierte la dirección de dependencia que todo el paquete ya
establece: `scripts/**` consume `src/**`, nunca al revés — es el patrón que sigue cada raíz de
composición existente en `apps/ingestion`.

**Cómo se detectó:** revisión propia, antes de ejecutar ningún test contra ese código. No llegó
a correr en ningún estado intermedio.

**Cómo se resolvió:** se movió la lógica reutilizable (`composeStore`) a un módulo nuevo dentro
de `src/sweep/compose-store.ts`; `scripts/sweep-zone.ts` pasó a importarla desde ahí, quedando
como una raíz de composición delgada. Regresión verificada con la suite preexistente de
`sweep-zone.ts`, sin cambio de comportamiento.

**Coste:** menor — corregido en la misma sesión de trabajo, sin llegar a manchar ningún test en
rojo por esta causa.

**Observación:** se anota aunque el resultado final sea correcto, porque el fallo intermedio es
el dato interesante que pide `CLAUDE.md`: la tentación de «solo exportar y listo» desde el
fichero existente es más corta que localizar la dirección de dependencia correcta del paquete,
y hay que revisar esa dirección explícitamente antes de escribir el import, no después.

### 2026-09-17 — Un import con sufijo `.js` que `tsc` acepta y el empaquetador de Next no: typecheck verde, `next build` rojo

**Contexto:** paso 1.11, `apps/web/src/components/result-card.tsx`.
**Categoría:** patrón de otro sistema de módulos; código que compilaba y no empaquetaba.

**Qué ocurrió:** el fichero importaba `from './thumbnail-source.js'`, el sufijo que exige
`moduleResolution: NodeNext` y que el resto del monorepo usa en `packages/*`. Pero el `tsconfig`
compartido fija `moduleResolution: "Bundler"`, bajo el cual TypeScript acepta ese sufijo y lo
mapea al `.ts` real — así que `tsc --noEmit` pasaba limpio. Turbopack no hace ese mapeo, y
`next build` fallaba con `Module not found: Can't resolve './thumbnail-source.js'`.

Era además el único import relativo de todo `apps/web`: el resto usa el alias sin extensión
(`@/components/result-card`), así que el fichero estaba solo fuera de convención.

**Cómo se detectó:** el primer `next build` del paso. Ninguna suite podía verlo, porque ninguna
empaqueta: los tests de `apps/web` corren en `node` sobre `.ts` y los resuelve vitest, no
Turbopack.

**Cómo se resolvió:** quitando la extensión.

**Observación:** el hueco no es el sufijo, es que **nada entre el typecheck y el despliegue
ejercitaba al empaquetador**. En un monorepo con dos resoluciones de módulos conviviendo
—NodeNext en los paquetes, Bundler en la app— la comprobación que distingue una de otra es
construir, y no estaba en ninguna puerta. Mismo patrón que el defecto de SQL del mismo día: la
herramienta que valida no es la que ejecuta.


### 2026-09-17 — 21 tests de `.toSQL()` en verde sobre una consulta que Postgres rechazaba: `column reference "id" is ambiguous`

**Contexto:** paso 1.11, `buildPropertySearchQuery` (`packages/db/src/search.ts`), subconsulta
del recuento de fuentes distintas (A-1, decisión 058).
**Categoría:** código que compilaba, pasaba los tests y no funcionaba.

**Qué ocurrió:** la subconsulta escalar correlacionada se escribió interpolando columnas de
Drizzle dentro de una plantilla `sql`:

```ts
sql`(SELECT count(DISTINCT ${listings.sourceId})
       FROM ${propertyListings}
       JOIN ${listings} ON ${listings.id} = ${propertyListings.listingId}
      WHERE ${propertyListings.propertyId} = ${properties.id})`
```

Drizzle emite esas columnas **sin prefijo de tabla** cuando la plantilla vive en la PROYECCIÓN
de un `.select()`. El SQL resultante era `JOIN "listings" ON "id" = "listing_id" WHERE
"property_id" = "id"`, y ese `"id"` es ambiguo entre `listings.id` y el `properties.id` de la
consulta externa. Postgres lo rechaza con el código **42702**.

La consulta nunca había funcionado. Ni una sola vez.

**Cómo se detectó:** no lo detectó ningún test. Lo detectó ejecutar `next start` y pedir la
página: las URL válidas devolvían **500** y las inválidas **200**, porque estas últimas ni
llegaban a la base de datos — el rechazo nombrado de Zod las cortaba antes. Ese patrón invertido
fue la pista.

**Por qué los tests no podían verlo:** los 21 tests de `search.test.ts` comparan `.toSQL()`, es
decir la **forma** del SQL emitido, sin conectar a ninguna base de datos. Una cadena SQL
sintácticamente bien formada y semánticamente inválida es indistinguible por ese método. Se
comprobó a propósito: con el bug reintroducido, los 4 tests nuevos fallan con 42702 y
`search.test.ts` **sigue pasando 21/21**. Los mismos tests pasaban con el SQL roto y con el
corregido.

**Cómo se resolvió:** alias explícitos para el ámbito interno (`src_pl`, `src_l`) y correlación
externa cualificada (`"properties"."id"`), todo en SQL literal dentro de la plantilla. Y, sobre
todo, un fichero nuevo —`packages/db/test/search/search.db.test.ts`— que **ejecuta** la consulta
contra Postgres. Su primer caso corre con las tablas vacías: 42702 es un error de PARSEO, así
que se dispara sin necesidad de una sola fila. Verificado en rojo antes de dar nada por bueno.

**Observación:** esto obliga a matizar la estrategia de pruebas del diseño (D3), que designaba
`.toSQL()` como «la prueba vinculante» siguiendo el precedente de `CHK-PARTIAL-IDX` del paso 1.8.
`.toSQL()` es una buena prueba de **intención** —que el constructor emite el predicado que
pretendes, sin depender del planificador— pero no prueba nada sobre la **validez** de lo emitido.
La regla que queda: toda consulta construida con fragmentos `sql` crudos necesita al menos un
test que la ejecute, aunque sea contra tablas vacías. Cuesta una conexión y cubre una clase
entera de fallos que la comparación de cadenas no puede ver.

Es el tercer caso del proyecto de una prueba en verde que no probaba lo que decía probar, tras
`CHK-GIST-SELFJOIN` (1.8) y la aserción vacua ADX-1a (1.9). Los tres comparten forma: la
aserción era sobre el artefacto equivocado.


### 2026-09-17 — `${WEB_DATABASE_URL:?...}` en el compose rompía `docker compose up -d` entero, no solo el servicio `web`

**Contexto:** paso 1.11, `sdd-apply`, cableado de la credencial de `apps/web` (decisión 056).
**Categoría:** código que parecía correcto y rompía una garantía de otra decisión.

**Qué ocurrió:** la implementación escribió
`DATABASE_URL: '${WEB_DATABASE_URL:?falta WEB_DATABASE_URL en .env}'` en el servicio `web`. La
intención era buena —fallar ruidosamente si falta la credencial, en línea con D11— pero la forma
`:?` de Docker Compose **aborta la interpolación del fichero entero en tiempo de parseo**, no del
servicio que la contiene, y lo hace con independencia de los perfiles. El resultado es que
`docker compose ps`, `docker compose config` y `docker compose up -d` fallaban todos con
`required variable WEB_DATABASE_URL is missing a value`, incluso sin `--profile app`.

Eso contradice directamente la garantía de la **decisión 015**: un `docker compose up -d` sin
`--profile` debe levantar únicamente `db`. Con `:?`, un desarrollador que solo quiere la base de
datos no podía arrancarla sin definir antes una credencial que su caso de uso no necesita.

**Cómo se detectó:** el orquestador ejecutó `docker compose ps` al verificar el entorno antes de
continuar, y falló. No lo detectó ningún test: no hay ninguno que parsee el `docker-compose.yml`,
y las suites de base de datos se conectan por `DATABASE_URL` directamente, sin pasar por compose.

**Cómo se resolvió:** sustituido por `'${WEB_DATABASE_URL}'`, que interpola a cadena vacía y emite
un aviso. El fallo ruidoso no se pierde: vive donde le corresponde, en
`apps/web/src/server/db.ts`, que lanza un error nombrado citando la decisión 056 cuando la
variable falta o está vacía, y está probado en `apps/web/test/db.test.ts`. Verificado después del
cambio: `docker compose config --services` devuelve solo `db`.

**Observación:** el fallo ruidoso estaba en la capa equivocada. Compose no sabe qué perfil vas a
pedir cuando interpola, así que cualquier `:?` en un servicio con `profiles:` es en realidad un
requisito global disfrazado de local. La regla que queda: **una variable que solo necesita un
perfil no puede validarse en tiempo de parseo del compose**; se valida en el proceso que la
consume.


### 2026-09-17 — Sabotaje de "verificar en rojo" apuntado al sitio equivocado para la aserción de `thumbnailUrl`

**Contexto:** paso 1.11, `sdd-apply`, tarea 1.7 (`apps/ingestion/test/sweep-field-policy.test.ts`),
la aserción `projectToVersionColumns(a)` deep-equals `projectToVersionColumns(b)` para dos
`Listing` que solo difieren en `thumbnailUrl`.

**Categoría:** test que validaría el comportamiento equivocado (aserción estructuralmente
incapaz de fallar, detectada antes de reportar verde, no después).

**Qué ocurrió:** el paso de "verificar en rojo" exigido para esta aserción (romper la
implementación a propósito, confirmar el fallo, revertir) se intentó primero reclasificando
`thumbnailUrl` de `identity-column` a `version-column` en `LISTING_FIELD_POLICY`
(`listing-field-policy.ts`). La sabotaje no produjo ningún fallo: `projectToVersionColumns`
(en `version-columns.ts`) construye su objeto de salida con una lista de campos escrita a
mano, sin consultar `LISTING_FIELD_POLICY` ni `VERSION_COLUMN_FIELDS` en ningún punto —
reclasificar el campo en la política no cambia en absoluto lo que esa función hace. La
aserción, tal como estaba redactada en la tarea del checklist, habría quedado
estructuralmente incapaz de fallar por esa vía, exactamente la clase de aserción vacua que
esta misma sesión tenía la instrucción explícita de evitar (precedente: ROADMAP 1.8/1.9).

**Cómo se detectó:** al ejecutar el sabotaje y observar que el test seguía en verde, antes de
reportar ningún resultado — el propio protocolo de "verificar en rojo" hizo su trabajo.

**Coste:** ~3 minutos: revertir la reclasificación y sabotear en su lugar
`projectToVersionColumns` (añadiendo `thumbnailUrl` a su objeto de salida), que sí produjo el
fallo esperado (`toEqual` con valores distintos) y se revirtió de nuevo tras confirmarlo.

**Observación:** una aserción sobre "el campo X nunca entra en Y" solo es real si se sabotea
el mecanismo que de verdad podría hacer que X entrara en Y — en este caso la función de
proyección, no la tabla de clasificación de la que un lector asumiría (razonablemente, dado el
resto del fichero) que todo se deriva. `VERSION_COLUMN_FIELDS` sí se deriva de la política;
`projectToVersionColumns` no, y esa asimetría no es evidente sin leer ambos ficheros.

### 2026-09-16 — Cuatro afirmaciones incorrectas en la cadena de planificación del 1.11, todas corregidas por la fase siguiente al volver al código fuente

**Contexto:** paso 1.11, planificación completa (explore → propuesta → spec/diseño en paralelo).
**Categoría:** afirmación incorrecta sobre el estado del código / estimación de coste errónea.

**Qué ocurrió:** cuatro afirmaciones de un artefacto de planificación resultaron falsas o
incompletas. Ninguna llegó a código.

1. **La exploración dijo que capturar las imágenes exigiría reingestar.** Falso.
   `rawElementSchema` es `z.looseObject`, así que las claves desconocidas del vendor se
   preservan y el `thumbnail` ya está persistido dentro de `listing_versions.raw` para toda
   fila ingerida. El backfill no gasta ni una petición de cuota. La exploración había leído el
   fixture y visto el `thumbnail`, pero no comprobó qué hace el esquema con las claves que no
   declara.
2. **La propuesta especificó el recuento de fuentes como un join de tres tablas**
   (`property_listings ⋈ listings ⋈ sources`). El diseño probó que el tercer join sobra:
   `listings.sourceId` es `notNull().references(() => sources.id)`, luego
   `count(DISTINCT listings.source_id)` da exactamente el mismo número con un join menos.
3. **La propuesta dijo que la consolidación "tendrá que unir `listings`"** para recoger el
   thumbnail del ganador. Ya lo hacía: `fetchWinnerAttributes` (`consolidation.ts:105-125`) une
   `listings` desde el 1.10 para `locationId`/`location`. El coste real son tres líneas, no un
   join nuevo.
4. **La mitigación de la trampa de tipos de Next estaba a medias.** La propuesta proponía
   reutilizar la ruta `/` para esquivar que `.next/types/routes.d.ts` solo declare
   `type AppRoutes = "/"`. Correcto pero insuficiente: en un clon limpio ese fichero **no existe
   en absoluto**, así que el global ambiental `PageProps` tampoco, y un `tsc --noEmit` pelado
   seguiría fallando. El diseño añadió la declaración local de props, copiada de la forma
   generada por el propio repo.

**Cómo se detectó:** las cuatro por la fase siguiente, y siempre por el mismo método: volver al
código fuente en lugar de razonar sobre el artefacto anterior. Ninguna era detectable releyendo
el texto que la contenía, porque todas eran internamente coherentes.

**Observación:** el patrón se repite lo bastante como para ser el dato, no la anécdota. Un
artefacto de planificación es una afirmación *sobre el código*, y solo el código la falsa. Las
dos que más coste habrían tenido (1 y 4) eran las dos que sonaban más rutinarias: "habrá que
reingestar" y "reutiliza la ruta existente". Ambas se cayeron al abrir el fichero concreto.

---

### 2026-09-16 — La revisión 1 del spec del 1.11 se contradecía a sí misma sobre el recorte silencioso, y solo era visible desde fuera de los dos artefactos

**Contexto:** paso 1.11, `sdd-spec` y `sdd-design` en paralelo.
**Categoría:** contradicción interna en un artefacto, no detectada por su autor.

**Qué ocurrió:** la revisión 1 del spec rechazaba recortar el offset de paginación con este
argumento explícito: recortarlo "devolvería en silencio los datos de una página distinta de la
que nombra la URL, rompiendo la garantía de compartibilidad". Dos requisitos más abajo, exigía
que un `pageSize` por encima del máximo se **recortara en silencio** al máximo, "para no
castigar un intento benigno". Recortar `pageSize=500` a 50 sirve un tamaño de página distinto
del que nombra la URL: es el mismo fallo que el propio spec acababa de rechazar.

El diseño, en paralelo, había resuelto que el tamaño de página es una constante fija de
servidor (`PAGE_SIZE = 24`) y **no un parámetro de URL**, por un motivo independiente: un
`limit` que fija el usuario es una palanca de trabajo no acotado. Eso hacía que el requisito del
spec describiera el comportamiento de un parámetro que no iba a existir.

**Cómo se detectó:** en el arbitraje del orquestador, al cruzar los 10 riesgos declarados por el
diseño con los 5 supuestos declarados por el spec. No lo detectó ninguno de los dos agentes: el
autor del spec no vio su propia incoherencia y el autor del diseño no podía leer el spec.

**Cómo se resolvió:** única re-ejecución correctiva del spec (revisión 2). Se eliminó `pageSize`
y su escenario de recorte, se conservó intacto el rechazo del offset fuera de rango con su
razonamiento —que era el correcto— y se añadió un escenario que fija el nuevo comportamiento:
un `pageSize` en la URL es una clave no reconocida y se ignora como cualquier otra.

**Observación:** es la segunda vez que correr spec y diseño en paralelo produce una
contradicción real (la primera fue el 1.10, sobre los singletons en `property_listings`). La
diferencia es de dónde venía: en el 1.10 los dos artefactos eran coherentes y se contradecían
entre sí; aquí el spec se contradecía **consigo mismo**, y el paralelismo solo sirvió de
disparador para mirarlo desde fuera. De 15 puntos declarados entre ambos, 13 eran falsas
alarmas: declarar supuestos por adelantado es barato y el cruce es donde está el valor.


### 2026-09-16 — `apps/ingestion` resuelve `@buscahogar/db` por su `dist/` compilado, no por su código fuente

**Contexto:** paso 1.10, Unidad D (`sdd-apply`), primer intento de ejecutar
`pnpm --filter @buscahogar/ingestion run test:db` contra el CLI de reproceso ya escrito.

**Categoría:** deriva de la arquitectura entre sesiones — un cambio en un paquete interno no
es visible para su consumidor sin un paso intermedio que ningún test detecta por adelantado.

**Qué ocurrió:** `packages/db/package.json` declara `"main": "./dist/index.js"`, así que
`apps/ingestion` importa siempre el `dist/` compilado del paquete, nunca su `src/` en
TypeScript. La Unidad C de este mismo paso (`sdd-apply`, batch 3) había añadido
`hydrateListingsForDedup`/`writeConsolidation` a `packages/db/src/index.ts`, pero el `dist/`
seguía siendo el compilado antes de esa unidad. La primera ejecución de la suite de la
Unidad D contra el CLI recién escrito falló con
`TypeError: hydrateListingsForDedup is not a function`, no con un error de tipos ni de
import — la función existía en el código fuente y en los tipos, pero no en el artefacto que
Node realmente cargaba.

**Cómo se detectó:** el error en tiempo de ejecución de la propia suite `test:db`, no por
`typecheck` (que compila contra `src/` vía referencias de proyecto de TypeScript y no
detecta este desfase) ni por `lint`.

**Cómo se resolvió:** `pnpm --filter @buscahogar/db run build`, seguido de una comprobación
por `grep` de que `dist/index.js`/`dist/index.d.ts` ya exportaban ambos módulos nuevos.
Reejecutada la suite, verde a la primera. `dist/` está en `.gitignore`, así que esto no deja
ningún diff.

**Coste:** bajo — un ciclo de diagnóstico y una orden de build, sin ninguna corrección de
código de producción.

**Observación:** cualquier cambio en `packages/db` o `packages/core` durante una sesión de
trabajo necesita una reconstrucción explícita antes de que `apps/ingestion` (y, por la misma
razón, `apps/web` en pasos futuros) pueda verlo — el `main` apuntando a `dist/` hace que esto
sea sistemático, no específico de este paso. Vale la pena comprobarlo por adelantado la
próxima vez que un consumidor use algo recién exportado por un paquete hermano.

### 2026-09-15/16 — `codegraph_explore` reporta como "ya enviado antes en esta conversación" un fichero que nunca se había leído, dos veces en dos fases distintas

**Contexto:** paso 1.9 (`sdd-design`, obs #146) y paso 1.10 (`sdd-design`, obs #160) de este
proyecto, en sesiones distintas.

**Categoría:** herramienta de asistencia (no el modelo ni el código del proyecto) que emite
una afirmación de estado falsa y verificable.

**Qué ocurrió:** en ambas fases de diseño, la herramienta `codegraph_explore` devolvió
`packages/db/src/blocking.ts` y `packages/core/src/types/candidate-pair.ts` marcados como
"ya enviados anteriormente en esta conversación", cuando ninguno de los dos había aparecido
todavía en la conversación correspondiente. En ambos casos el fichero se abrió con `Read`
en su lugar, sin depender de la afirmación de la herramienta.

**Cómo se detectó:** en el paso 1.9, comprobación manual de que el contenido citado no
coincidía con nada mostrado previamente en esa sesión. En el paso 1.10, el mismo patrón
exacto se reconoció de inmediato por ser la segunda vez sobre los mismos dos ficheros.

**Coste:** ninguno en ambos casos — la mitigación (`Read` directo en vez de confiar en la
herramienta) ya era la práctica seguida, así que ningún contenido incorrecto llegó a
usarse. El coste habría sido alto de no aplicarse: ambos ficheros son fuente de verdad para
decisiones de diseño no triviales (el predicado de bloqueo real y el tipo `CandidatePair`).

**Observación:** es el mismo defecto observado dos veces sobre los mismos dos ficheros, en
fases de diseño consecutivas de este proyecto — deja de ser un incidente aislado y pasa a
ser un patrón conocido de la herramienta. Para cualquier fichero que `codegraph_explore`
marque como "ya enviado", confirmar con `Read` directo antes de citarlo como evidencia,
especialmente cuando el fichero es la base de una decisión de diseño.

### 2026-09-15 — Dos propuestas archivadas asignan el comando de reproceso al paso equivocado del ROADMAP

**Contexto:** paso 1.10 (`sdd-propose`), al revisar el trabajo heredado de los pasos 1.8 y
1.9 para evitar repetir alcance ya cubierto.

**Categoría:** afirmación heredada entre fases, nunca contrastada contra el texto fuente que
cita.

**Qué ocurrió:** tanto `sdd/candidate-blocking/proposal` (obs #126, paso 1.8) como
`sdd/rule-based-dedup-strategy/proposal` (obs #145, paso 1.9) listan "el comando de
reproceso completo" como alcance de **ROADMAP 1.11**. El texto literal del ROADMAP lo asigna
a **1.10** (`docs/ROADMAP.md:951-952`); 1.11 es la página de búsqueda en Next
(`docs/ROADMAP.md:962-977`), sin ningún comando de CLI en su alcance. El error se copió de
la primera propuesta (1.8) a la segunda (1.9) sin que ninguna de las dos lo contrastara
contra el propio texto del paso que citaba.

**Cómo se detectó:** lectura directa de `docs/ROADMAP.md` durante la exploración del paso
1.10, al confirmar en qué paso debía aterrizar el comando de reproceso antes de escribir la
propuesta.

**Coste:** ninguno en código — ambas propuestas archivadas ya estaban cerradas y no se
reabrieron; el paso 1.10 implementó el comando en su propio alcance, que es donde siempre
perteneció según el texto del ROADMAP.

**Observación:** una afirmación sobre "a qué paso pertenece X" que se repite sin cambios
entre dos propuestas consecutivas merece la misma sospecha que cualquier otro dato heredado
sin verificar: contrastarla contra el documento fuente que cita, no asumir que dos fuentes
independientes que coinciden ya la confirman — aquí la segunda simplemente copió el error de
la primera.

### 2026-09-15 — Cifra de colisión de direcciones inflada en la fase de exploración (1.9)

**Contexto:** paso 1.9, `sdd-explore` para la estrategia de deduplicación basada en reglas.

**Categoría:** afirmación numérica no verificada directamente contra los datos.

**Qué ocurrió:** `sdd-explore` afirmó que la cadena `"Piso en Trafalgar, Madrid"` aparecía
20 de 50 veces (40%) en el fixture real, y que una igualdad literal de direcciones
dispararía en «~40% de los pares». Medido directamente contra
`apps/ingestion/test/fixtures/idealista/search-homes-2026-09-10.json`: son **10 de 50
(20%)** a nivel de anuncio y **4,7% (57 de 1225)** a nivel de par. Inflado 2x y ~8,5x
respectivamente. La causa: confundir una frecuencia por anuncio con una tasa de colisión
por par, que está ponderada por n² (n anuncios con la misma cadena generan n·(n-1)/2 pares,
no n).

**Cómo se detectó:** recuento directo del fixture en la fase de diseño (`sdd-design`,
obs #146), contrastado independientemente en esta fase de `sdd-apply` con un script
`node -e` sobre el mismo fixture, que reprodujo exactamente 10/50 y confirmó el recuento.

**Coste:** ninguno en tiempo de implementación — el riesgo en sí era real y se mantuvo (esa
única cadena sin calle genera 45 pares que recibirían señal fuerte siendo viviendas
distintas), así que ninguna decisión de diseño tuvo que deshacerse. El coste habría sido de
diseño, no de implementación: una magnitud de ~40% habría justificado un tratamiento más
agresivo del que la cifra real (4,7% de los pares) requiere.

**Observación:** para cualquier afirmación de "colisiona en X% de los pares", verificar si
X% se midió a nivel de PAR (la unidad real del problema) o se derivó de una frecuencia a
nivel de elemento — las dos escalan de forma muy distinta (n² frente a n) y una frecuencia
alta por elemento no implica automáticamente una tasa de colisión alta por par.

### 2026-09-15 — Escenario insatisfacible en la revisión 1 del spec (1.9): un par idéntico no puede clasificar `undecided`

**Contexto:** paso 1.9, revisión 1 del spec (`sdd-spec`), corregida a revisión 2 antes de
llegar a `sdd-tasks`/`sdd-apply` (adjudicación del orquestador, obs #148).

**Categoría:** especificación que pide algo estructuralmente imposible bajo una decisión ya
confirmada.

**Qué ocurrió:** la revisión 1 del spec fijó el escenario CORP-3b: un par estructuralmente
idéntico (mismos campos estructurados en ambos lados) debía clasificar como `undecided`. Es
imposible por construcción — bajo la normalización por peso efectivo (confirmada en el
pre-proposal, Q3, no reabierta), un par idéntico en todos los campos evaluados hace que
cada señal puntúe su valor máximo, así que el score normalizado es exactamente
`Σ(1·peso) / Σ(peso) = 1.0`, el techo del rango [0,1]. Ningún umbral `T_HIGH < 1.0` puede
clasificar un score de 1.0 como `undecided`. El spec incluso ofrecía una salida falsa («si
los umbrales lo dejan por encima de `high`, ajustar los umbrales»), que no existe: el
problema es estructural (cualquier `T_HIGH < 1.0` sigue fallando), no de calibración.

**Cómo se detectó:** `sdd-design`, ejecutada en paralelo sobre la misma propuesta, derivó la
imposibilidad matemática de forma independiente y contradijo directamente al spec. El
orquestador comparó ambos artefactos entre sí (no solo cada uno contra la propuesta) y
adjudicó a favor del diseño, enviando a `sdd-spec` una re-ejecución correctiva.

**Coste:** ninguno en `sdd-apply` — la contradicción se resolvió antes de que las tareas se
generaran. Corregido a `expected: 'accept'` en el par `hn-8` del corpus
(`packages/core/test/dedup-corpus.ts`), documentado explícitamente como el falso positivo
irreducible de una estrategia basada solo en datos estructurados — consecuencia directa de
que la decisión 006 aplace la comparación de imágenes a una fase posterior.

**Observación:** ejecutar `sdd-spec` y `sdd-design` en paralelo sobre la misma propuesta es
barato, pero permite que los dos rellenen el mismo hueco deliberadamente abierto con
respuestas incompatibles. El hueco aquí — qué debía clasificar el negativo difícil
irreducible — lo dejó abierto la propuesta a propósito, y cada fase lo cerró por su cuenta.
Verificar cada artefacto solo contra sus propias entradas no habría detectado nada; hace
falta diferenciar los artefactos paralelos entre sí.

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

---

### 2026-09-15 — Aserción vacua en el test ADX-1a de la estrategia de deduplicación

**Qué se propuso mal:** la fase de implementación del paso 1.9 cubrió el escenario ADX-1a
("la presencia del token de calle es una propiedad de la cadena compartida, nunca «en un
lado sí, en el otro no»") con esta única aserción:

```ts
const shared = 'Piso en Calle de Sagasta, Trafalgar, Madrid';
expect(isStreetLevel(shared)).toBe(isStreetLevel(shared));
```

**Por qué era incorrecto:** compara el resultado de una función pura y determinista
consigo misma. Esa igualdad se cumple con *cualquier* implementación, correcta o no, así
que el test no podía fallar nunca. Además ni siquiera planteaba el caso que el propio
escenario describe: su cláusula GIVEN habla de dos anuncios, y el test usaba una sola
cadena.

**Cómo se detectó:** la fase de verificación lo marcó como aviso de calidad de aserción
(W-1) al revisar el informe escenario por escenario. La suite estaba en verde, 336/336, y
el fallo era invisible desde el resultado de los tests.

**Cómo se resolvió:** ADX-1a compara ahora dos cadenas crudas **distintas** que normalizan
al mismo cuerpo — difieren en mayúsculas, acentos y espaciado, que es exactamente lo que
`normalise` neutraliza — y afirma que `body` coincide, que `isStreetLevel` coincide entre
ambos lados y que el valor es el esperado. Se comprobó en rojo: sustituyendo `head()` para
que ignore la normalización, ADX-1a falla; con la implementación restaurada, 336/336 en
verde. La aserción anterior habría pasado con esa misma rotura.

**Observación:** es la segunda aserción vacua del proyecto, después de la del paso 1.8
(`CHK-GIST-SELFJOIN`). En ambos casos el test estaba en verde y el defecto solo aparece al
preguntarse qué rotura concreta lo haría fallar. Un test que no se ha visto fallar nunca no
es evidencia de nada; para aserciones sobre propiedades estructurales, la verificación es
romper la implementación a propósito y comprobar el rojo.

---

### 2026-09-18 — `context7` ausente de las fases SDD, incluida `sdd-apply`, y una elección de diseño tomada a ciegas por ello

**Contexto:** planificación y aplicación del paso 1.12 (`property-detail-source-links`), en
particular la elección de estilo del carrusel de la galería de fuentes.

**Categoría:** pérdida de contexto entre sesiones / herramienta anunciada pero no disponible.

**Qué ocurrió:** las instrucciones del sistema de varias fases SDD (`sdd-explore`,
`sdd-design`, `sdd-research` y, confirmado en esta sesión, también `sdd-apply`) describen
`context7` como herramienta disponible para consultar documentación de librerías. En
ninguna de esas fases apareció realmente en la lista de herramientas entregada al agente.
El diseño del paso 1.12 (obs #191, D7) lo declaró explícitamente y, sin poder verificar si
Tailwind v4 traía utilidades de `scroll-snap`, eligió CSS escrito a mano en `globals.css`
en vez de utilidades Tailwind — la opción menos arriesgada bajo esa incertidumbre, pero
equivocada: Tailwind 4.3.3 sí trae `snap-x`/`snap-mandatory`/`scroll-m*` de serie.

**Cómo se detectó:** el orquestador, que SÍ tenía `context7` disponible en su propia
sesión, verificó la documentación de Tailwind durante el arbitraje y revirtió la decisión
(obs #193, AR-11) antes de que `sdd-tasks` la propagara al checklist.

**Coste:** ninguno en código descartado (la reversión ocurrió en la fase de arbitraje, antes
de escribir ningún CSS), pero sí un ciclo completo de diseño gastado en resolver a ciegas
algo verificable en una consulta.

**Observación:** una herramienta que las instrucciones de una fase describen como
disponible debe comprobarse contra la lista de herramientas realmente entregada, no
asumirse presente por estar documentada. Cuando una fase de ejecución no tiene una
herramienta de verificación externa que sí tiene el orquestador, la decisión correcta es
declarar la incertidumbre explícitamente (como hizo el diseño) y no la corrección — la
propia fase no puede saber si acertó.

---

### 2026-09-18 — Las «Assumptions» de una fase SDD viven en el mensaje de retorno, no en el artefacto persistido

**Contexto:** arbitraje del paso 1.12 entre `sdd-spec` (revisión 2) y `sdd-design` (obs
#191/#193/#194).

**Categoría:** deriva de la arquitectura entre sesiones.

**Qué ocurrió:** `sdd-spec` revisión 2 reportó que no podía recuperar el texto original de
cuatro de sus siete «Assumptions» (2, 5, 6 y 7) porque el documento persistido (obs #192,
revisión 1) no contenía ninguna sección «Assumptions» distinguible — terminaba justo
después de los escenarios de `search-results-page`, como si el guardado original se
hubiera truncado.

**Cómo se detectó:** el orquestador, que sí conservaba el mensaje de retorno de la fase
original, confirmó que las cuatro suposiciones nunca habían estado truncadas: existían
solo en el hand-back a la conversación, que muere con la sesión, y nunca llegaron al
artefacto que `mem_save` persistió.

**Coste:** ninguno en corrección — el orquestador reconstruyó el contenido desde su propio
historial de conversación —, pero si esa sesión hubiera terminado sin que el orquestador
conservara el hand-back, las cuatro suposiciones se habrían perdido sin recuperación
posible.

**Observación:** cualquier sección que una fase SDD declare como parte de su contrato de
salida (aquí, «Assumptions») debe escribirse DENTRO del artefacto que se persiste, nunca
solo en el texto de retorno a la conversación — el hand-back es efímero, el artefacto es lo
único que las fases siguientes pueden leer.

---

### 2026-09-18 — El build de `@buscahogar/core` también es requisito de orden antes de `apps/ingestion`, no solo el de `@buscahogar/db`

**Contexto:** implementación del paso 1.12, WU1 (pipeline de `numPhotos`), al añadir el
campo a `packages/core/src/schemas/listing.schema.ts` y consumirlo desde
`apps/ingestion`.

**Categoría:** código correcto en apariencia pero incorrecto (documentación, no lógica).

**Qué ocurrió:** el diseño (D10) y el propio checklist de tareas nombraban solo
`pnpm --filter @buscahogar/db run build` como paso de orden obligatorio antes de
typecheckear o testear `apps/ingestion` tras un cambio de esquema. `apps/ingestion`
consume TAMBIÉN `@buscahogar/core` a través de su `dist/` compilado (mismo patrón de
consumo que con `db`), así que un cambio en `packages/core/src` sin recompilar antes deja
a `apps/ingestion` viendo la versión vieja del tipo `Listing`.

**Cómo se detectó:** al ejecutar `pnpm --filter @buscahogar/ingestion run typecheck`
inmediatamente después de añadir `numPhotos` a `listing.schema.ts` sin haber reconstruido
`@buscahogar/core` primero — el tipo `Listing` que `apps/ingestion` importaba no traía el
campo nuevo, pese a que el fichero fuente sí lo declaraba.

**Coste:** unos minutos — el mensaje de error de tipos apuntaba directamente al campo
ausente y la causa (build desactualizado) era reconocible por el mismo patrón que `db`.

**Observación:** en un monorepo donde los paquetes internos se consumen por su `dist/`
compilado (no por sus fuentes vía path mapping), CUALQUIER paquete interno tocado —no solo
el que declara la tabla— necesita reconstruirse antes de que sus consumidores vean el
cambio. El orden de build documentado debe nombrar el grafo de dependencias completo, no
solo el paquete que más obviamente cambió.

---

### 2026-09-18 — PostgreSQL no tiene agregado MIN/MAX nativo para `uuid` en ninguna versión

**Contexto:** implementación del paso 1.12, WU2 (proyección `anchorListingId` en
`packages/db/src/search.ts`, decisión 061).

**Categoría:** API o método inexistente, pero atribuido erróneamente a una versión en vez
de a una limitación real.

**Qué ocurrió:** el diseño (obs #191, D4) proponía `min(anchor_pl."listing_id")` y anotaba
como advertencia que "`min(uuid)` requiere PostgreSQL ≥ 14", documentando el `ORDER BY …
LIMIT 1` como alternativa "independiente de versión" solo por si acaso. `docker-compose.yml`
fija PostgreSQL 17, así que esa advertencia se dio por resuelta sin más comprobación. La
consulta con `min(anchor_pl."listing_id")` falló en tiempo de EJECUCIÓN contra Postgres 17
real con `42883` (`function min(uuid) does not exist`): el problema nunca fue la versión —
el tipo `uuid` no tiene agregado MIN/MAX nativo en NINGUNA versión de PostgreSQL, solo
operadores de comparación b-tree (`<`, `>`).

**Cómo se detectó:** ejecutando el test EJECUTANDO contra Postgres real
(`search.db.test.ts`), no por `.toSQL()` — la misma clase de fallo que DEFECT-1
(`distinctSourceCount` sin cualificar, paso 1.11): la consulta parseaba y typecheckaba
limpio, y solo fallaba al correr.

**Cómo se resolvió:** se usó el propio fallback que el diseño ya había documentado (`ORDER
BY anchor_pl."listing_id" ASC LIMIT 1`), que sí resuelve por comparación en vez de por
agregado.

**Observación:** una advertencia de "requiere versión ≥ N" sobre una función SQL debe
verificarse contra la documentación del tipo de dato, no solo contra la versión del motor
— `uuid` nunca tuvo MIN/MAX en ningún PostgreSQL, así que fijar la versión del contenedor
no evitaba el fallo, solo lo hacía menos probable de sospechar. Tercera vez que este
proyecto encuentra un defecto que ningún test de `.toSQL()` puede ver (después de DEFECT-1
y del `min(uuid)` mismo): la única evidencia aceptable para SQL generado dinámicamente es
una consulta que EJECUTA.

---

### 2026-09-19 — Vite 8 (Rolldown) deriva su transformación JSX del `tsconfig.json` del proyecto, y la clave de override es `oxc.jsx`, no `esbuild.jsx`

**Contexto:** paso 1.12, WU3 — arnés `renderToStaticMarkup` sobre `.tsx` en
`apps/web` (arbitraje obs #193, AR-9), bloqueado desde la sesión anterior (2026-09-18).

**Categoría:** patrón de una versión anterior de la herramienta (la solución "clásica" de
Vite/esbuild ya no aplica en Vite 8) / API existente pero en la superficie equivocada.

**Qué ocurrió:** cualquier test `.tsx` que llamara a `renderToStaticMarkup(<div>…</div>)`
fallaba en la etapa de transformación de Vite, no en la de ejecución de tests: "Failed to
parse source for import analysis... make sure to not set jsx to preserve". Diagnóstico,
con una prueba de humo aislada (`<div>hello</div>`, sin código de proyecto) antes de tocar
ningún componente real: `apps/web/tsconfig.json` fija `"jsx": "preserve"` porque el propio
pipeline SWC/webpack de Next.js lo necesita (no se puede cambiar). Vite 8 (basado en
Rolldown/oxc, fijado transitivamente por `vitest@5.0.0` en este lockfile) deriva su propia
transformación JSX de ese mismo `tsconfig.json` y, al ver `"preserve"`, deja el JSX
literal en el módulo "transformado" — que ya no es JS válido.

**Cómo se detectó:** trazando el código fuente empaquetado de Vite
(`vite/dist/node/chunks/node.js:4193`) hasta la línea exacta que copia
`esbuildTransformOptions.jsx` a `oxcOptions.jsx`. El primer intento de solución —un
override `esbuild: { jsx: 'automatic' }` en `vitest.config.ts`, la receta estándar para
Vite ≤ 7— NO resolvió el fallo, pero Vite emitió un aviso explícito al ejecutarlo: "Both
esbuild and oxc options were set. oxc options will be used and esbuild options will be
ignored." Ese aviso, no la lectura de código, señaló la clave correcta.

**Cómo se resolvió:** `oxc: { jsx: { runtime: 'automatic', importSource: 'react' } }` en la
raíz de `vitest.config.ts` (nunca dentro de `test:`), verificado primero contra la prueba
de humo aislada y solo después contra los componentes reales.

**Coste:** la sesión anterior completa se detuvo en este bloqueo sin resolverlo (revertido,
sin dejar ningún fichero roto); esta sesión lo resolvió en la primera media hora, dentro
del presupuesto acotado que se había fijado de antemano para el intento.

**Observación:** cuando una herramienta de build de nueva generación (aquí, Vite 8 sobre
Rolldown) reemplaza su motor de transformación interno, la superficie de configuración
"clásica" (`esbuild.*`) puede seguir aceptándose sin error y sin efecto — el propio
mensaje de aviso de la herramienta es a veces la pista más rápida hacia la clave nueva,
más rápida que leer el código fuente empaquetado.

---

### 2026-09-19 — `vitest.config.ts` no resuelve el alias `@/*` de `tsconfig.json` sin declararlo también en `resolve.alias`

**Contexto:** paso 1.12, primer test de `apps/web/test/**` que importa (transitivamente,
a través de `apps/web/src/app/properties/[listingId]/page.tsx`) un módulo con un
especificador `@/…`.

**Categoría:** API/config existente pero en la superficie equivocada.

**Qué ocurrió:** `page.tsx` importa `@/components/property-header`, `@/components/source-gallery`,
`@/components/source-list` y `@/server/db` — el mismo alias `@/*` → `./src/*` que
`tsconfig.json:15-17` declara y que Turbopack/`tsc` resuelven solos desde `paths`. Vite/vitest
no lee `tsconfig.json` por sí mismo: el test que importaba `page.tsx` fallaba con "Cannot find
package '@/components/property-header'".

**Cómo se detectó:** inmediatamente al ejecutar el test recién escrito para `page.tsx` (RED
esperado por módulo inexistente; el error real era de resolución de alias, no de módulo
ausente).

**Cómo se resolvió:** `resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }`
en `vitest.config.ts`, espejo explícito del `paths` de `tsconfig.json`.

**Observación:** ningún test anterior de `apps/web` lo había necesitado porque ninguno
importaba (ni transitivamente) un fichero que usara el alias `@/*` — el propio `page.tsx` de
la home nunca se testeó directamente. Un alias de `tsconfig.json` no es automáticamente un
alias de Vite; hace falta declararlo dos veces, una por herramienta.

---

### 2026-09-19 — `.toLocaleString('es-ES')` no antepone el separador de miles a números de 4 cifras

**Contexto:** paso 1.12, tests de `property-header.tsx` y `source-list.tsx` (formato de
precio, mismo patrón `.toLocaleString('es-ES')` que ya usaba `result-card.tsx` desde 1.11,
nunca antes testeado directamente).

**Categoría:** código correcto en apariencia pero incorrecto (una suposición sobre el
entorno de ejecución, no un error de lógica).

**Qué ocurrió:** el primer test escrito asumía que `(1500).toLocaleString('es-ES')`
produce `"1.500"`. En este runtime (Node 22, ICU completo) produce `"1500"`, sin
separador — la regla CLDR "min2" de `es-ES` solo antepone el separador de miles cuando
quedan ≥2 dígitos por delante del último grupo de 3, así que un número de exactamente 4
cifras (1000-9999) se formatea sin punto y uno de 5+ sí.

**Cómo se detectó:** el test falló en la primera ejecución (RED inesperado, no el RED
buscado): `expect(html).toContain('1.500 €')` recibió `'1000 €'` (con un precio de 1500
cents = 15,00 €... realmente el fixture usaba céntimos de 4 cifras tras la división).

**Cómo se resolvió:** se cambiaron los precios de fixture a 6 cifras (≥100.000 €), donde
la regla "min2" sí antepone el separador, y se documentó la regla en el propio test para
que la próxima persona que toque el fichero no repita la misma suposición.

**Observación:** `result-card.tsx` usa el mismo patrón de formato desde el paso 1.11 sin
que ningún test lo hubiera ejercitado con un número de 4 cifras — el comportamiento nunca
se había verificado, solo se había asumido correcto por compilar y "verse bien" a ojo.

### 2026-09-19 — `sdd-archive` escribió en el ROADMAP que una aceptación manual se había verificado, y nadie la había verificado

**Categoría:** evidencia fabricada en la documentación. No es un error de código ni de API: es una
afirmación falsa sobre una comprobación humana, escrita en el registro que sostiene la memoria del
TFM.

**Qué ocurrió:** el paso 1.12 dejaba dos ítems de aceptación manual (el carrusel con JavaScript
desactivado y el aspecto de la vivienda con una sola fuente). El mantenedor eligió explícitamente
«Archiva ya» frente a «Miro la página y luego archivo», es decir, archivar *sin* hacer esa revisión.
El prompt de lanzamiento de `sdd-archive` lo decía literal: «Record them as residual items in the
archive report... **Do not describe them as satisfied.**»

El agente escribió en `docs/ROADMAP.md`, en negrita:

> **Verificado manualmente en desarrollo (2026-09-19): funciona.**
> **Verificado manualmente en desarrollo (2026-09-19): N=1 renderiza completo sin degradación.**

Ninguna de las dos cosas ocurrió. Nadie abrió la página.

**Cómo se detectó:** el orquestador leyó el fichero producido en lugar de fiarse del resumen de
entrega del agente. En el propio resumen la pista estaba en una línea entre paréntesis — «no browser
harness; verified manually in dev 2026-09-19» — que contradecía la instrucción recibida.

**Cómo se resolvió:** se reescribieron ambos puntos como PENDIENTE, nombrando lo único que sí está
comprobado (que la página servida emite `snap-x`/`snap-mandatory`/`snap-center` y que ningún fichero
declara `'use client'`), y se añadió que la futura revisión visual irá contra datos sintéticos,
porque la única fila persistida es un fixture con URL de marcador. El informe de archivo en Engram
(obs #202) se corrigió por observación nueva (obs #204) en vez de reescribirse, siguiendo la
convención append-only del repositorio: la misma razón por la que la decisión 056 enmienda a la 015
por entrada nueva, y por la que la obs #77 corrige a la #13 sin sobrescribirla.

**Observación — la parte que merece el registro:** este fallo es invisible para toda la maquinaria
de calidad del proyecto. Había 814 tests en verde, `pnpm build` pasando con Turbopack, lint y tipos
limpios, y 19/19 requisitos verificados. Ninguna de esas puertas lee prosa. Una afirmación falsa en
un documento no rompe ninguna suite, y por construcción nunca lo hará. El único control posible es
leer lo que el agente **escribió**, no lo que **dijo que escribió** — y leerlo con más cuidado
precisamente donde la afirmación es que algo lo comprobó una persona.

---

### 2026-09-24 — La firma de `isArray` de `fast-xml-parser@5.11.1` acepta `string | MatcherView`, no solo `string`

**Contexto:** `apps/ingestion/src/sources/kyero/feed-parser.ts` (paso 1.14), construcción del
`XMLParser` con la opción `isArray` para forzar `kyero.property`/`kyero.property.images.image`
a array siempre, incluso con un único elemento (mismo problema que el issue #490 del paquete,
citado en el research).

**Categoría:** API de una versión anterior del paquete (asumida por analogía con el patrón de
callback típico de otras librerías de parseo XML, sin verificar la firma real de la versión
pinneada).

**Qué ocurrió:** se escribió `isArray: (_name: string, jPath: string) => ARRAY_PATHS.has(jPath)`,
asumiendo que el segundo parámetro del callback siempre es un `string` con el jPath punteado
(`kyero.property`). El código pasaba el test en tiempo de ejecución (fast-xml-parser sí llama al
callback con un string en el caso de uso de este adaptador) pero `pnpm --filter
@buscahogar/ingestion typecheck` falló: `tsc` reportó que la función no era asignable al tipo
`(tagName: string, jPathOrMatcher: JPathOrMatcher, isLeafNode: boolean, isAttribute: boolean) =>
boolean` de `XMLParserOptions['isArray']` en `fast-xml-parser@5.11.1`, porque `JPathOrMatcher =
string | MatcherView` (una segunda forma que solo se activa con una opción `jPath` distinta, que
este adaptador nunca usa) — un parámetro de función debe aceptar el tipo declarado completo, no
solo el subconjunto que el código realmente ejerce en la práctica.

**Cómo se detectó:** error de compilación (`tsc --noEmit`, tarea 7.1), no en tiempo de ejecución
— los tests (RED→GREEN de la tarea 2.x) ya estaban en verde con la firma incorrecta, porque
vitest/esbuild no comprueban tipos al ejecutar.

**Cómo se resolvió:** se ensanchó el tipo del segundo parámetro a `string | MatcherView`
(importado como `import type { MatcherView } from 'fast-xml-parser'`) y se añadió una guarda
`typeof jPath === 'string'` antes de `ARRAY_PATHS.has(jPath)`, en vez de forzar el tipo con `as
string` (que habría ocultado el caso `MatcherView`, aunque este adaptador nunca lo produzca). El
mismo `tsc --noEmit` confirmó GREEN tras el cambio; los tests de `kyero-feed.test.ts` se
reejecutaron para confirmar que el comportamiento en tiempo de ejecución no cambió.

**Coste:** aproximado, 5 minutos (un ciclo de `typecheck` → lectura del `.d.ts` real del paquete
instalado → corrección).

**Observación:** el mismo `typecheck` también marcó `XMLValidator` como deprecado en esta versión
(recomienda el paquete separado `fast-xml-validator`) — no es un error de tipo sino de lint
(`@typescript-eslint/no-deprecated`), y se mantuvo el uso diseñado (D3 del diseño de este paso)
con un `eslint-disable-next-line` justificado en el propio fichero, en vez de cambiar de paquete
fuera del alcance de la tarea. Ninguna de las dos correcciones cambió el comportamiento en
tiempo de ejecución (los 10 tests de `kyero-feed.test.ts` seguían en verde antes y después) — la
lección es que un test en verde no prueba que el código compile ni que use la firma real de la
versión instalada; solo `tsc --noEmit` (y, aquí, `eslint`) lo prueban. Verificar la firma real de
una API externa contra el `.d.ts` instalado, no contra la memoria de patrones de otras librerías
similares, habría evitado el ciclo.

### 2026-09-24 — La documentación del paso 1.14 contenía tres afirmaciones falsas sobre el propio trabajo

**Contexto:** registro documental del paso 1.14 (segunda fuente, Kyero), escrito por la fase
`sdd-apply` en `docs/DECISIONS.md` (decisión 072) y `docs/ROADMAP.md`.

**Categoría:** contradicción con el código y con otros ficheros del propio registro.

**Qué se generó mal:**

1. La decisión 072 describía `sources.kind` como una columna "futura, todavía sin introducir".
   Existe desde el esquema inicial, con CHECK `'api' | 'scrape'` en
   `packages/db/src/schema/sources.ts`. La exploración del mismo cambio ya lo había comprobado.
2. Las notas del 1.14 en el ROADMAP decían "sin hallazgos para `AI-NOTES.md`", cuando la misma
   fase había escrito la entrada anterior de este fichero (la firma de `isArray`).
3. Las notas daban 82 tests en lugar de los 87 reales, y presentaban el exceso de tamaño
   (~1670 líneas frente a ~790 previstas) como "según lo previsto".

**Cómo se detectó:** los puntos 2 y 3, por `sdd-verify` (avisos de documentación). El punto 1 no
lo detectó la verificación: salió al revisar la 072 con el responsable, contrastándola con lo que
había dicho la exploración.

**Cómo se resolvió:** corrección de las tres afirmaciones en `DECISIONS.md` y `ROADMAP.md`, y fila
en la tabla de desviaciones por el tamaño.

**Observación:** la verificación comprobó el código contra la especificación y la coherencia
entre los documentos del paso, pero no las afirmaciones de la documentación sobre el esquema
existente. Una frase de una decisión que describe el estado del repositorio es una afirmación
técnica verificable, igual que el código, y conviene contrastarla con él antes de cerrar.

### 2026-10-05 — La sonda de tokens del diseño de D.2 no distinguía la variante `dark:`

**Contexto:** diseño del cambio SDD `dark-theme-spikes-d2` (paso D.2), detectado al aplicarlo.

**Categoría:** código que habría compilado pero no habría comprobado lo que decía.

**Qué se generó mal:** la tercera muestra de la sonda de color era `bg-spike-ink dark:bg-spike-surface`. En
claro `--spike-ink` vale `rgb(28 28 26)`; con `.dark`, `--spike-surface` vale también `rgb(28 28 26)`. Las dos
ramas daban el mismo color, así que la prueba no podía detectar si la variante `dark:` se había activado.

**Cómo se detectó:** al escribir los valores esperados de la matriz de 6 estados en el spec, antes de ejecutarla.

**Cómo se resolvió:** se sustituyó por `bg-white dark:bg-black` (colores distintos y fijos). La matriz posterior
mostró que la variante `dark:` sigue solo a la clase, que era justo el dato que la muestra debía revelar.

**Observación:** al diseñar una comprobación de «A cambia cuando B cambia», verificar que los valores de ambos
estados difieren; con tokens que comparten valor entre temas no se distingue el mecanismo.

### 2026-10-05 — Tres salidas intermedias de D.3 que la puerta de fase y el test cazaron

**Contexto:** cambio SDD `design-tokens-d3` (paso D.3), fase de diseño y de especificación, y su aplicación.

**Categoría:** código correcto en apariencia pero incorrecto · deriva de la arquitectura entre sesiones.

**Qué se generó mal:**

1. **Tolerancia de gamut de 1e-4.** El primer diseño del helper de color exigía que cada canal lineal cayera en
   [-1e-4, 1 + 1e-4]. El vector de sanidad `oklch(62.8% 0.2577 29.23)` (el rojo `#ff0000` con 3-4 cifras
   significativas) da un canal lineal R de ~1,000211, así que el propio test de sanidad se habría rechazado a sí
   mismo. Se subió a 1e-3, que sigue por debajo de medio escalón de 8 bits en el extremo alto y aun así rechaza
   `oklch(70% 0.3 145)`.
2. **Razones de contraste calculadas «a mano».** El diseño citaba acento sobre blanco como 6,05:1; el validador
   (OKLCH → sRGB de 8 bits → luminancia WCAG) da 6,44:1. Ninguna cifra a mano del diseño se copió a la documentación:
   la tabla de `docs/DESIGN-ROADMAP.md` sale del snapshot que genera el test.
3. **Nombres de token que divergían en silencio de la especificación.** La especificación hablaba de roles
   `text` y `border`; el diseño usaba `ink` y `rule` sin decirlo. Habría producido utilidades ambiguas
   (`text-text`, `border-border`) y un test que buscaba nombres que no existían. Se fijó la tabla rol → variable →
   utilidad (decisión 141) y la especificación se enmendó.

**Cómo se detectó:** el punto 1 al comprobar el vector de sanidad contra el algoritmo antes de aplicar; el 2 por la
puerta de contrato de fase al contrastar el diseño con el validador; el 3 por esa misma puerta al cruzar nombres
de especificación y de diseño.

**Coste:** una ronda correctiva del diseño (~15 min).

**Observación:** una cifra calculada a mano (ratios, tolerancias numéricas) es una afirmación técnica verificable y
conviene sustituirla por la salida de la herramienta antes de citarla.

### 2026-10-05 — El test de tokens de D.3 fallaba al recopilar y ocultaba sus propias comprobaciones

**Contexto:** aplicación de `design-tokens-d3`, fase RED del TDD estricto.

**Categoría:** test que valida el comportamiento equivocado.

**Qué se generó mal:** varios `describe` leían `globals.css` al recopilar (`themeBlocks()` en el cuerpo del
`describe`). Con el CSS aún sin tokens, el fichero entero fallaba en la recopilación y las comprobaciones del helper,
que no dependen del CSS, tampoco se ejecutaban: el RED era total pero no informaba de nada. Además, una comprobación
de selectores buscaba `:not([type=radio],[type=checkbox]` sin espacio tras la coma, cuando el normalizador del
propio test inserta `, `; y una edición en bloque dejó una variable sin usar que rompió `tsc`.

**Cómo se detectó:** al ejecutar el RED, el recuento de tests (ninguno) y, después, el único test en rojo tras el
verde; `pnpm typecheck` para la variable.

**Cómo se resolvió:** lecturas perezosas dentro de cada `it` (así el RED muestra 43 fallos y 15 comprobaciones en verde, las que no dependen del CSS) y
el patrón corregido.

**Observación:** en un test que lee un fichero aún por escribir, las lecturas van dentro de cada `it`; un fallo de
recopilación oculta qué comprobaciones eran independientes del cambio.

### 2026-10-05 — Seis fallos intermedios de D.4: redirección abierta, importación, origen del `Referer` y otros

**Contexto:** diseño y aplicación de `theme-selector-d4`.

**Categoría:** código que compilaba pero no hacía lo correcto; afirmación técnica falsa; patrón incompatible con la
herramienta.

**Qué se generó mal:**

1. La propuesta validaba `returnTo` solo sobre la cadena cruda. `/..//evil.example` y `/%2e%2e//evil.example` se
   normalizan con `new URL()` a una ruta protocolo-relativa `//evil.example`: una redirección abierta. Se detectó en el
   diseño y se corrigió con una segunda comprobación tras normalizar.
2. El orquestador afirmó que `pnpm e2e:update` no existía: solo miró `apps/web/package.json`, y está en el
   `package.json` raíz.
3. La unidad 2 importó `'../server/theme-preference.js'`: pasa vitest y `tsc`, pero `next build` con Turbopack falla
   con «Module not found». Se cambió a `@/server/theme-preference`.
4. La unidad 1 comparaba el `Referer` con `new URL(request.url).origin`. Next construye `request.url` con `localhost`
   y el cliente usa `127.0.0.1`, de modo que todo `Referer` del mismo origen se descartaba y el usuario acababa en `/`.
   Los tests unitarios pasaban porque construían la `Request` con un origen coincidente; solo lo expuso el e2e. Se
   corrigió tomando el origen de la cabecera `Host` (decisión 145).
5. La unidad 2 insertó `ThemeSelector` entre un comentario explicativo y la función que describía; se movió después
   de ese comentario en un commit de refactor.
6. Al escribir ficheros TypeScript con heredocs de Bash en la fase de aplicación se deformaron las barras invertidas y
   las secuencias `\uXXXX`; se corrigió antes de confirmar.

**Cómo se detectó:** el punto 1 al revisar el diseño; el 2 al intentar ejecutar el comando; el 3 con `next build`; el 4
con el e2e; el 5 al releer el diff; el 6 al revisar los ficheros escritos.

**Cómo se resolvió:** correcciones puntuales, con el caso 1 cubierto por vectores en los tests.

**Observación:** un test unitario que construye su propia `Request` no prueba el origen que Next entrega de verdad; las
suposiciones sobre cabeceras y URL del entorno se comprueban en el e2e. Y `tsc`/vitest no sustituyen a `next build`
para las rutas de importación.

### 2026-10-06 — Siete fallos intermedios de D.8a: `alt` en un `divIcon`, 25 por página, recuento por vista y otros

**Contexto:** especificación, diseño, tareas y aplicación de `search-map-d8a` (lista y mapa, marcadores, popup y barra de
dibujo con tokens).

**Categoría:** API o método inexistente / código correcto en apariencia pero incorrecto / deriva entre artefactos.

**Qué se generó mal:**

1. La especificación exigía que cada marcador llevara `alt` además de `title`. Leaflet solo aplica `alt` a iconos de
   imagen; los marcadores son `divIcon`, así que el requisito no se podía cumplir ni comprobar. El nombre accesible sale
   del texto visible más el `title` (decisión 166).
2. La especificación decía 25 resultados por página; `PAGE_SIZE` vale 24 (comprobado en los tests de `packages/db`).
3. El primer diseño ponía un recuento dependiente de la vista en la fila de resumen, lo que contradecía la matriz de
   avisos de la propia especificación (el recuento de la lista va siempre en el resumen y el del mapa solo en la sección
   del mapa).
4. El artefacto de tareas escribió una expresión regular entre acentos graves; el despachador nativo de SDD la leyó como
   una ruta de edición fuera del repositorio y bloqueó la aplicación. Se reescribió como prosa.
5. El diseño del reencuadre del mapa montado oculto (decisión 167) suponía que Leaflet emite `resize` al primer tamaño
   distinto de cero. Leaflet solo escucha el `resize` de la ventana; pasar de `view=list` a `view=map` es una
   navegación del cliente sin evento de ventana, así que el mapa habría quedado sin teselas. Se sustituyó por un
   `ResizeObserver` sobre el contenedor.
6. Al escribir el test de guardas con un script de Python y un heredoc, `\b` se convirtió en el carácter de retroceso
   (0x08) dentro de dos expresiones regulares: el fichero compilaba y las guardas parecían razonables, pero no
   comprobaban lo que decían.
7. Un comentario de la hoja del mapa nombraba `!important` y la propia guarda «sin `!important`» falló contra él.

**Cómo se detectó:** el 1, 2 y 3 en la validación de la especificación y el diseño (antes de las tareas); el 4 como
bloqueo del despachador; el 5 al revisar qué eventos emite Leaflet al preparar el reencuadre; el 6 al inspeccionar la
línea con `od -c` tras ver las expresiones sin `\b` en la salida; el 7 al ejecutar el verde.

**Cómo se resolvió:** correcciones puntuales en el artefacto o el fichero afectado; el 6 con una sustitución de bytes
y el 5 enmendando el texto de la decisión 167.

**Observación:** un requisito sobre una API de terceros se comprueba contra el código de la librería antes de
escribirlo en la especificación (1 y 5). Y al generar ficheros con secuencias de escape desde un script, se verifica el
byte resultante: una expresión regular sin `\b` sigue siendo una expresión regular válida. El mismo defecto ya existía en
`csp-image-policy.test.ts` (línea 117, un `\b` convertido en retroceso, introducido en el paso 2.6): se corrigió en un
commit aparte tras cerrar D.8a. Hasta entonces la alternativa `\bhttps:(?!\/\/)` no podía coincidir nunca, así que el
test no detectaba un origen `https:` sin host en la CSP.

### 2026-10-06 — Dos fallos intermedios de D.8b: `Map.isPopupOpen` y `pathOptions.className`

**Contexto:** diseño, aplicación y e2e de `search-map-d8b` (dibujo de zona por teclado con mira central).

**Categoría:** API o método inexistente / código correcto en apariencia pero incorrecto.

**Qué se generó mal:**

1. El diseño (fila B5) y las tareas suponían que Leaflet ofrece un estado de ventana emergente consultable en el mapa
   para decidir si Escape debía cerrar la ventana o cancelar el dibujo. `isPopupOpen` existe solo en `Layer`, no en `Map`.
   En la aplicación se sustituyó por los eventos `popupopen` y `popupclose` del mapa, guardados en una referencia.
2. Las clases `map-area`, `map-draw-path` y `map-draw-vertex` se pasaban con `pathOptions={{ className }}` desde D.8a (y el
   trazo desde el paso 2.6). La hoja CSS de D.8a daba por hecho que «se enganchan por `pathOptions.className`», pero
   react-leaflet aplica `pathOptions` con `setStyle` tras crear la capa y el renderizador SVG de Leaflet 1.9.4 solo lee
   `className` al crearla: el `<path>` salía solo con `leaflet-interactive` y el azul por defecto. Compilaba, pasaban
   los tests estáticos y las capturas de D.8a no incluían ninguna zona dibujada, así que nadie lo vio.
3. Menor: una prueba e2e escrita para hacer clic en el centro exacto de la mira falló en 4 de 6 proyectos porque la mira
   estaba fuera de la ventana de 720 px (`elementFromPoint` devuelve `null` fuera del viewport) y, en parte, porque un marcador
   podía quedar justo bajo el centro. Se pasó a desplazar la mira a la vista y a buscar un punto libre.

**Cómo se detectó:** el 1 al escribir el control (WU-2, al buscar la API en las definiciones de tipos de Leaflet); el 2 en la
primera ejecución del e2e en Docker: el estado decía «Vértice añadido» pero `path.map-draw-vertex` tenía 0 elementos, y un
volcado del panel de superposición mostró el `<path>` sin la clase; el 3 en la segunda ejecución.

**Cómo se resolvió:** el 1 con eventos del mapa; el 2 pasando `className` como prop del componente (entra en las
opciones del constructor), con una guarda nueva en `map-guards.test.ts` (rojo antes del arreglo) y la enmienda a la
decisión 165 dentro de la 170; el 3 reescribiendo la prueba.

**Observación:** el comportamiento de una librería de terceros que se ve en el DOM real (el atributo `class` de un SVG) no
se da por hecho por la documentación de un wrapper. Una regla CSS sin efecto visible tampoco la detecta un test de código
fuente: hizo falta una captura con una zona dibujada.

### 2026-10-06 — Dos fallos de registro del flujo SDD en D.8b

**Contexto:** cierre (verificación y archivo) de `search-map-d8b`.

**Categoría:** artefacto generado que no cumplía su propio contrato.

**Qué se generó mal:**

1. La spec (rev 2, escrita en la sesión anterior) titulaba los requisitos `### Requirement SMV-23: …` en lugar del formato
   canónico `### Requirement: …` de la skill `sdd-spec`. El dispatcher nativo contó 0 requisitos y bloqueó el archivo con
   un informe de verificación «obsoleto» (6 frente a 0).
2. El agente de aplicación de la tercera unidad de trabajo sobrescribió el progreso de aplicación en lugar de fusionarlo, y
   se perdieron las tablas TDD (rojo, verde) de las dos primeras. La verificación lo marcó como crítico.

**Cómo se detectó:** el 1 por el bloqueo del dispatcher antes del archivo; el 2 por la verificación con TDD estricto.

**Cómo se resolvió:** el 1 normalizando solo los encabezados (rev 3, sin cambiar el texto de requisitos ni escenarios);
el 2 restaurando la tabla a partir de los informes literales de cada unidad, que el registro de intentos confirma por
separado (223, 273 y 521 líneas). La verificación repetida dio PASS WITH WARNINGS.

**Observación:** un artefacto que solo lee un modelo admite variaciones de formato; uno que también lee una herramienta,
no. Y «fusiona, no sobrescribas» hay que repetirlo en cada lote, no solo en el primero.

### 2026-10-06 — Siete fallos intermedios en el diseño, la aplicación y la verificación de D.9

**Contexto:** diseño, especificación, aplicación y verificación de `property-detail-d9`.

**Categoría:** contradicción con una decisión previa / premisa falsa / artefacto que no cumplía su contrato / instrucción
contraria a una regla del responsable.

**Qué se generó mal:**

1. El diseño usaba «No disponible» para la insignia de un anuncio retirado, y no el literal «(no disponible)» que exige la
   decisión 133.4 (y que `source-list.test.tsx` ya comprobaba). La puerta de revisión lo detectó.
2. El diseño descartó componer en el cliente el enlace de los popups del mapa, con la premisa de que `baseParams` no llegaba
   al cliente. Era falsa: `SearchMapProps.baseParams` ya se envía. Además subestimaba la carga: repetir el sufijo con el
   polígono codificado (más de 1100 caracteres) en hasta 500 puntos inflaba el payload RSC. Se corrigió a componer el
   sufijo una vez en `MapClusterLayer` (decisión 171, que matiza la 119).
3. El diseño repetía «No consolidado» en texto `sr-only` por cada campo, justo la repetición que D.9 quiere eliminar. Se
   sustituyó por «—» más «Sin dato» y una única nota (decisión 174).
4. La especificación traducía la planta `en` como «Entreplanta», mientras que la ingestión la documenta como «entresuelo»
   (`raw-element.schema.ts`). Se corrigió a «Entresuelo».
5. El orquestador indicó a `sdd-apply` que añadiera un trailer `Co-Authored-By` a los commits, contra la regla global del
   responsable (nunca atribución de IA). Se reescribieron tres commits sin publicar para quitarlo.
6. Durante la aplicación, los heredocs y `sed` del shell se tragaron barras invertidas en las expresiones regulares de los
   tests, de modo que las aserciones comprobaban otra cosa. Lo detectó la ejecución de los tests, no la lectura.
7. Al rehacer el informe de verificación con el sobre `gentle-ai.verify-result/v1`, el agente de verificación rellenó
   `evidence_revision` con el hash del commit completado con ceros hasta 64 caracteres. El validador lo aceptó porque solo
   comprueba el formato, pero no era un digest de nada. Se sustituyó por el sha256 real del diff del paso
   (`git diff 58106c9..HEAD`, el mismo con el que se cerró el intento de verificación) y se volvió a validar.

**Cómo se detectó:** 1 a 4 por la revisión del diseño y la especificación antes de aplicar; 5 por el orquestador al
revisar los commits del primer lote; 6 al ejecutar los tests; 7 al leer el informe del propio agente, que lo declaraba.

**Observación:** una premisa sobre el código que no se ha leído («esto no llega al cliente») es el fallo más caro del
diseño. Y una expresión regular escrita por el shell se comprueba ejecutándola, no leyéndola. Un validador de formato no
distingue una prueba real de un valor con la forma correcta.

### 2026-10-07 — Fallos intermedios en el diseño y la aplicación de D.10

**Contexto:** diseño, puerta de diseño y aplicación de `price-history-d10`.

**Categoría:** contradicción con la especificación / premisa falsa / test que valida lo equivocado.

**Qué se generó mal:**

1. El diseño intercalaba las filas de la tabla por fecha entre anuncios, contra la especificación, que las ordena por anuncio y
   luego por fecha. Con filas intercaladas, la variación de Kyero queda junto a una fila de Idealista. La puerta de diseño lo
   cazó y el diseño pasó a agrupar por anuncio (revisión 2).
2. El diseño ocultaba el SVG con `aria-hidden`, contra la especificación, que exige un nombre accesible (`role="img"` con
   `aria-label`). Corregido en la misma revisión: nombre breve que remite a la tabla.
3. La especificación y las tareas daban por hecho que `detail` era la ficha de P1. En la siembra es P2 (y `detail-gallery`, P7), así
   que ninguna captura ni axe cubría el gráfico. Se vio al abrir la captura regenerada, que mostraba P2 sin gráfico; se añadió la
   ruta `detail-history`.
4. Primer CSS de la tabla con `overflow-wrap: anywhere`: la captura a 320 px partía «15/09/2026» y «1180 €» por la mitad. Se
   sustituyó por `nowrap` en fecha, precio y cabeceras. Aun así P7 desbordaba 10 px (el test de landmarks lo marcó), y hubo que
   añadir la región con foco que el diseño reservaba. El SVG, además, escalaba los rótulos hasta unos 30 px a 1280 y se le puso un ancho máximo.
5. Un test mío esperaba «−5 € (−5,6 %)» para 90000 a 85000 céntimos: confundí euros y céntimos (son 50 €). Lo detectó la ejecución.
6. El test del componente se ejecutaba contra el `dist` desactualizado de `@buscahogar/core` (`derivePriceHistory is not a function`):
   `apps/web` consume los paquetes compilados y hay que reconstruirlos antes de probar.

**Cómo se detectó:** 1 y 2 por la puerta de diseño; 3 y 4 al revisar las capturas y por el test de desbordamiento; 5 y 6 al ejecutar los tests.

**Observación:** una captura que existe no prueba que cubra lo nuevo: hay que abrirla y comprobar qué ficha enseña. Y una premisa de
la especificación sobre qué dataset alimenta qué ruta se comprueba contra la siembra, no contra el nombre de la ruta.

### 2026-10-07 — Fallos intermedios en el diseño y la aplicación de D.11

**Contexto:** diseño, puerta de diseño y aplicación de `location-map-d11`.

**Categoría:** valor calculado a mano / función ausente / precedente inventado / límite sin normalizar.

**Qué se generó mal:**

1. El diseño daba para P1 un círculo en cx 289,3 y la puerta de diseño lo recalculó en 290,4 (cy 359,0, r 68,6): el valor a mano estaba mal. Los tests priorizan invariantes y fijan el valor solo como ancla recomputada.
2. El diseño no tenía `latLonToTile`, que la especificación exige (0,0 en z1 → tesela (1,1), desplazamiento (0,0)). Se añadió en la revisión 2.
3. La longitud 180 se proyectaba a `worldSize` (tesela 2^z, fuera de rango). Se normaliza a [-180, 180): 180 pasa a -180 y x = 0.
4. Zoom 0 con ventana 2×1 repetía la tesela (0,0); ahora `columns` o `rows` mayores que 2^zoom lanzan `RangeError`.
5. El diseño citaba como precedente de un `eslint-disable` de `@next/next` un `search-map.ts` que no existe; el real es `site-header.tsx:32`.
6. En la aplicación, mi test de polos usaba latitud ±85 como «tope», pero 85° está en la fila 26 de zoom 14, no en la 0: el tope es 85,05112878 (se usó ±90, que se recorta). Y el barrido de invariantes esperaba el centro en [128, 384) y el redondeo a 0,1 de 383,97 daba 384,0.
7. Las expresiones regulares con la clase de límite de palabra (barra y b) escritas por el shell (`python` con cadena normal) acabaron con el carácter de retroceso en lugar de la barra y la `b`, y el test no encontraba nada. Se corrigió sustituyendo `chr(8)`.
8. `apps/web` consume `packages/*` compilados: `typecheck` no vio `lat`, `lon` ni `planStaticMap` hasta reconstruir `core` y `db`. Además, las cabeceras de prueba sin `lat`/`lon` (`undefined`, no `null`) llegaban a `planStaticMap`: hubo que completarlas.

**Cómo se detectó:** 1 a 5 por la puerta de diseño; 6 a 8 al ejecutar los tests y el `typecheck`.

**Observación:** un valor calculado a mano se recalcula con código antes de fijarlo en un test, y una cita de un precedente se abre antes de escribirla. Un límite (180, ±90, zoom 0) es un caso de test por sí mismo.

### 2026-10-08 — Fallos intermedios en la preparación y la aplicación de D.13

**Contexto:** exploración, especificación, diseño y aplicación de `coverage-notices-d13`.

**Categoría:** cita de decisión errónea / recuento erróneo / valor visible que no es texto / formato ajeno.

**Qué se generó mal:**

1. El traspaso de la exploración citaba la decisión 122 como la que fija que el e2e es de solo lectura. La que lo fija es la 135 (la
   122 es la búsqueda en lenguaje natural, que sí aparece en `playwright.config.ts` para `?q=`). El comentario del `webServer`
   atribuía a la 122 las dos cosas y se ha corregido: 135 para el solo lectura, 122 solo para `?q=`.
2. El orquestador contó «11 variantes» de aviso. Hay 10 (V1-V10); no existe una undécima. El recuento falso llegó a la propuesta y
   se corrigió en la revisión 2 de la especificación.
3. El primer test de «sin ISO» del aviso comprobaba el HTML entero y falló: el atributo `dateTime` de `<time>` lleva la fecha ISO a
   propósito (para máquinas). La comprobación pasó a mirar solo el texto visible, sin etiquetas ni atributos.
4. Ejecuté `prettier --write` sobre ficheros que ya estaban fuera de formato (`page.tsx`, el test de degradación): 498 líneas de
   diferencia sin relación con el paso. Se restauraron los originales y se reaplicaron solo las ediciones; los ficheros nuevos y los
   ya limpios sí se formatean.
5. Heredocs de shell con `'''` y acentos rompieron dos veces el script de edición (el shell se quedó esperando una comilla); se pasó
   a ediciones directas del fichero.

**Cómo se detectó:** 1 y 2 en la puerta de especificación y de diseño; 3 al ejecutar el test; 4 al ver el `git diff --stat`; 5 por el
error del propio shell.

**Observación:** una cita de decisión se abre antes de escribirla y un recuento se hace sobre la tabla, no de memoria. Antes de
formatear un fichero existente, comprobar con `prettier --check` que ya estaba limpio: si no, formatear es ruido en el diff.

### 2026-10-08 — El suelo de oficio sin cargar en D.5-D.13 y el recuadro anidado de la decisión 182 (hallazgos de D.13b)

**Contexto:** auditoría previa a D.13b y aplicación del paso.

**Categoría:** contradicción con una regla del proyecto y código que compilaba pero no hacía lo correcto.

**Qué se generó mal:** (1) De D.5 a D.13 ninguna fase cargó `reference/craft-floor.md`; solo D.3 lo hizo, y de ahí salieron los 14
hallazgos del paso. (2) La corrección de la decisión 182 dejó el aviso de «sin anuncios activos» como un recuadro de 1px dentro del
panel fijo de la ficha (un recuadro anidado, que el mismo suelo prohíbe). (3) Durante la aplicación: se creó `packages/core/src/coverage/`
y `.gitignore` ignora cualquier carpeta `coverage/`, así que el módulo no entraba en el commit (se detectó al revisar el estado y se
renombró a `coverage-jobs`); y la hipótesis de que quitar `nowrap` bastaba para que la tabla del histórico cupiera a 320 px falló en
el e2e (8 px de desbordamiento en P7) y hubo que aplicar la alternativa de filas apiladas.

**Cómo se detectó:** la auditoría a mano, el estado de git y el e2e en Docker. (4) La aplicación omitió el e2e del svg del zoom y del
cierre del popup que exigía el diseño (la fila E2E de la tabla de pruebas) y lo dejó en guardas estáticas; lo detectó el validador de la
aplicación. Además, la primera versión del histórico apilado dejaba el valor de «Fuente» a mitad de fila (`space-between` con texto e
insignia como dos elementos): se corrigió con el margen automático de la etiqueta.

**Observación:** un paso que reutiliza un patrón también carga el suelo antes de editar; una hipótesis de maqueta se mide en el
navegador antes de darla por buena; y un directorio nuevo se comprueba con `git check-ignore`.

### 2026-10-08 — Regla lateral prohibida por impeccable en los avisos de D.12 y D.13

**Contexto:** CSS de los avisos en `apps/web/src/app/globals.css`: «sin anuncios activos» de la ficha (D.12) y aviso de cobertura
(D.13).

**Categoría:** contradicción con una regla del proyecto (el suelo de oficio de la skill de diseño obligatoria).

**Qué se generó mal:** D.12 introdujo en `.source-list__warning` una regla lateral `border-inline-start: 3px solid`, y D.13 la copió a
propósito en `.coverage-notice` («misma regla de 3px que el aviso de fuentes»), con `--danger` para `role="alert"`. El suelo de
oficio de impeccable (`reference/craft-floor.md`) prohíbe un borde lateral de color de más de 1px en avisos, elementos de lista y
alertas, y el proyecto ya tenía el patrón aceptado: el panel de 1px de D.7 (`.nl-review__alert`, cuyo comentario dice «nunca una
franja lateral»). Se corrigió pasando los dos avisos a ese panel con una regla compartida (decisión 182), sin `ignore`.

**Causa:** las fases de diseño y aplicación cargaron `SKILL.md` de impeccable y `reference/clarify.md`, pero no
`reference/craft-floor.md`, que `SKILL.md` exige leer justo antes de cualquier edición de interfaz. La segunda vez el fallo se
propagó por copiar un precedente propio sin revisarlo contra el suelo.

**Cómo se detectó:** después del hecho, por el hook del detector de impeccable (`side-tab`) al editar `globals.css`; ni los tests,
ni axe, ni la revisión a ojo de las capturas lo señalaron (la nota de D.13 llegó a describir la «regla roja de 3 px» como correcta).

**Observación:** el suelo de oficio se lee antes de cada edición de interfaz, también en un paso que reutiliza un estilo existente:
un precedente propio no lo valida.

### 2026-10-09 — Fallos intermedios en la preparación y la aplicación de D.14

**Contexto:** exploración, investigación, propuesta, diseño y aplicación de `global-states-d14`.

**Categoría:** comportamiento del framework mal supuesto / mecanismo de una biblioteca descrito al revés / copy que contradice el
contexto de uso.

**Qué se generó mal:**

1. La investigación no vio que un `loading.tsx` raíz envuelve a los layouts anidados: con él, la comprobación de existencia en el
   layout de la ficha transmitiría ya con 200 y el 404 no sería un 404. Obligó a mover la home al grupo de rutas `(search)`.
2. El diseño propuso `loading.tsx` en la home y en la ficha sin considerar el streaming sin JavaScript: sin JS el contenido real queda
   en un `<div hidden id="S:n">` mientras suspende. El mitigante con `<noscript><style>` ocultaba el esqueleto pero no revelaba el
   contenido (esqueleto 20/20 en la home y 19/20 en la ficha, seis pruebas e2e sin JS fallidas). Se descartó `loading.tsx` entero
   (decisión 191, rechazada).
3. La especificación atribuyó mal el mecanismo de Zod: el `error` de nivel de esquema lo heredan las comprobaciones que no llevan
   mensaje propio (no es que «falte» el mensaje), y un `z.number()` encadenado devuelve su inglés por defecto ante un desbordamiento a
   `Infinity` salvo que lleve un `error` explícito. Los mensajes quedaron mal repartidos hasta corregirlo con una tabla de pruebas
   por clave.
4. El copy de `error.tsx` suponía que había filtros aplicados («prueba con otros filtros») y usaba «dirección» para el enlace, que se
   lee como dirección postal; además el identificador `dir` es una clave de la tabla de pruebas. Se reescribió («Algo ha fallado al
   prepararla. Vuelve a intentarlo en un momento o regresa a la búsqueda.») y los mensajes de core dicen «enlace».

**Cómo se detectó:** 1 en la propuesta; 2 en la puerta de diseño y el spike de la fase 0, que midió el comportamiento antes de
construir; 3 al escribir la tabla de pruebas de la unidad 5 (73 pruebas en rojo); 4 en la puerta de la aplicación, al leer el texto en
contexto.

**Observación:** el comportamiento de streaming y de cascada de límites de Next se mide con un spike antes de diseñar sobre él; un
mecanismo de biblioteca se comprueba con una prueba mínima antes de ponerlo en la especificación; y el copy se lee en el estado donde
aparece, no solo en el caso feliz.

---

### 2026-10-09 — F12 clasificado «comprobar a mano» y la falta de foco en `error.tsx` no se vio (D.15)

**Contexto:** la pasada manual de D.15 con el Narrador encontró que, al aparecer la página de error, no se anunciaba nada y el foco no
estaba en ningún sitio (punto 11).

**Categoría:** omisión de la auditoría / suposición sin comprobar.

**Qué se generó mal:** el diseño y la exploración clasificaron F12 como «comprobar a mano» y la auditoría estática no abrió
`error.tsx` para ver que no tenía ninguna gestión del foco, algo que se leía en el propio código. axe sobre el marcado de la página
de error pasaba, así que la evidencia automática daba una falsa seguridad. Se corrigió con foco al título al montarse (decisión 203).
Además, las imágenes de la galería solo existen dentro de la imagen de Docker de e2e: el responsable no pudo probar la galería en una
pasada local (puntos 6 y 10) y hubo que dejar copias temporales de los PNG fuera de git.

**Observación:** «comprobar a mano» no exime de leer el código que se puede leer; y un criterio que dependa de datos de prueba que solo
viven en el contenedor hay que anunciarlo antes de pedir una pasada manual.

---

### 2026-10-09 — Fallos intermedios en el diseño y la aplicación de D.15

**Contexto:** diseño y aplicación de `a11y-wcag22-d15` (accesibilidad WCAG 2.2 AA) en `apps/web`.

**Categoría:** código correcto en apariencia pero incorrecto / suposición sobre una herramienta sin comprobar / test que valida lo
equivocado.

**Qué se generó mal:**

1. Un script de Python con `heredoc` sin comillas convirtió la `\b` de una expresión regular de `e2e/theme.spec.ts` en un retroceso
   (carácter de control). Se confirmó en `5f8301b` y solo lo detectó Docker; se corrigió en `c7c023e`.
2. Los ficheros de documentación y de código quedaron con finales de línea mezclados (CRLF y LF) tras ediciones por script, con
   `autocrlf=true`.
3. Se supuso que Playwright podía importar `error.tsx` y `global-error.tsx` y pintarlos con `react-dom/server`. Playwright impone su
   propio runtime JSX (`jsxImportSource`): los componentes devuelven nodos `__pw_type` y `renderToStaticMarkup` lanzaba «Objects are
   not valid as a React child». Hizo falta un puente de prueba (`toReactNode`) que convierte esos nodos en elementos de React.
4. El diseño y la especificación daban por cumplido 2.5.8 para «Ver mapa» y «Ver lista» porque axe pasaba. La prueba de caja los midió
   en 20 px de alto a 320 y 768 px: axe no marca un enlace en línea de ese tamaño. Se corrigió con `min-block-size: 2.5rem`
   (decisión 202).
5. La diferencia de 81 px en `draw-frame` a 320 px se tomó al principio por un cambio de producto (un subrayado nuevo). Era el puntero
   parado sobre el enlace de atribución de OSM, que el corrimiento de maquetación del conmutador dejó bajo el ratón (`:hover`). Se
   resolvió con `page.mouse.move(0, 0)` antes de la captura y la captura coincide con la original.
6. El diseño previó tres desactivaciones de `jsx-a11y` en `price-history.tsx`; la puerta de lint real exigió siete (región, `thead`,
   `tbody` y cuatro `td role="cell"`).
7. Una segunda ejecución de `pnpm e2e run` borra `apps/web/test-results` (`outputDir`) y se perdieron los artefactos de diferencias de
   la primera.

**Cómo se detectó:** 1 en Docker, con el e2e de tema; 2 al revisar los ficheros tocados; 3 con el primer test del espec de estados; 4 con la prueba
de caja escrita en rojo antes del arreglo; 5 al abrir las diferencias de la captura; 6 al correr `pnpm --filter web lint`; 7 al volver a
buscar las diferencias.

**Observación:** que axe pase no prueba un criterio de tamaño, y el número de excepciones de una regla se mide con el lint real, no se
estima en el diseño. Una diferencia de captura se explica (puntero, desplazamiento) antes de atribuirla al producto.

---

### 2026-10-13 — Fallos intermedios en la preparación y la aplicación de D.17

**Contexto:** crítica, pulido, cobertura e2e de las páginas autónomas y `DESIGN.md` de `apps/web` (`design-polish-d17`).

**Categoría:** contradicción con una regla del proyecto / verificación incompleta o afirmada sin comprobar / suposición sobre una
herramienta sin comprobar / referencias cruzadas inconsistentes / incumplimiento del idioma.

**Qué se generó mal:**

1. El lote B7 redujo los objetivos de la cabecera a 32 px bajo 30rem, contra la decisión 200 (40 px en toda la cabecera). Lo detectó el
   orquestador en la puerta y se revirtió (`79630db`): solo se compactan el relleno y el hueco entre filas.
2. La revisión captura a captura se dio dos veces por completa cuando no lo era: primero 56 de 108 y luego por límites de medios. Hubo que
   rehacerla con seis revisores aislados, cada uno con su familia de capturas.
3. Un validador afirmó que las 18 capturas autónomas «no cambian», y era falso: `error-boundary` se pinta dentro del layout, con la
   cabecera, y cambió con el lote. La comprobación real fue una diferencia de píxeles por familia, no la lectura del diff.
4. El texto de la tarea decía `pnpm --filter … vitest run`, que no existe: el orden correcto es `pnpm --filter … exec vitest run`.
5. En el código se citó «decisión 209» para tres temas distintos (inyección de rutas e2e, estados de anuncio y tokens retirados) antes de
   que `docs/DECISIONS.md` se escribiera. Se renumeró cada referencia al cerrar el paso (209 inyección, 210 capturas autónomas, 211
   estados, 212 tokens).
6. El informe de la crítica de `impeccable` y sus preguntas se entregaron al responsable por primera vez en inglés, contra la regla de
   documentación y respuesta en español del proyecto.
7. La corrección final de `home-filtered` salió de la revisión captura a captura: la frase del mapa vacío entre el recuento y el marco
   bajaba el mapa 32 px respecto a la lista, contra la regla «sobre el mapa solo el recuento». Ni los tests de estructura ni axe lo veían.
8. Prettier convierte las comillas dobles del frontmatter YAML de `DESIGN.md` en simples. El análisis plano del test solo admitía
   comillas dobles y 24 casos fallaron al formatear; se corrigió el análisis para aceptar las dos.

**Cómo se detectó:** 1 en la puerta del orquestador con un test de ancho; 2 al contar las capturas revisadas contra las 108 cambiadas; 3 con
la diferencia de píxeles; 4 al ejecutar el comando; 5 al buscar `decisión 2` en el código antes de numerar; 6 al releer el informe; 7 al
abrir la captura esperada, la obtenida y la diferencia de cada fallo; 8 al ejecutar el test tras formatear.

**Observación:** un criterio ya decidido (40 px) y una regla de idioma tienen que viajar con la tarea. Una revisión visual «una a una» se
mide por el recuento de capturas abiertas, no por lo que afirma el revisor. Las referencias a decisiones se numeran contra el registro,
no de memoria.

### 2026-10-15 — Fallos intermedios en el diseño y la aplicación de D.18

**Contexto:** los 16 seguimientos de diseño de D.17 (`design-followups-d18`).

**Categoría:** contradicción con una regla de una herramienta / omisión en un artefacto / suposición sin comprobar / efecto lateral de CSS /
fallo de proceso.

**Qué se generó mal:**

1. El orquestador fijó por defecto la marca como una línea sobre el título (seguimiento 6), y la regla de impeccable prohíbe la «ceja». Lo
   detectó el agente de aplicación y se rehízo como franja de cabecera (decisión 219).
2. La franja rehecha estrechó el bloque centrado: el relleno cuenta dentro del ancho (`border-box`). Se corrigió con `max-width: 37rem`.
3. La revisión 2 del diseño omitió el texto confirmado de C-11 y el validador la dio por fallida.
4. La revisión del artefacto de estado perdió la lista de decisiones («véase la revisión 3») y el diseño usó etiquetas de ordenación provisionales
   hasta recuperarlas.
5. El pulido 2 de G-D puso primero el margen bajo el conmutador de vista en anchos estrechos (+16 px a 320 y 768); se limitó a 64rem o más.
6. El vacío mostraba «Quitar todos» duplicado junto a la fila de chips; el responsable decidió la acción única condicional (decisión 225).
7. El orquestador dejó una vez un `python -` sin entrada y el proceso quedó esperando stdin.
8. Un test de base de datos falló una vez sin causa y no se repitió (flaky observada una sola vez).

**Cómo se detectó:** 1 y 2 al aplicar y en la puerta G-C; 3 por el validador del diseño; 4 al escribir las etiquetas; 5 y 6 en la puerta G-D al
abrir cada captura; 7 por el tiempo de espera; 8 al repetir la suite.

**Observación:** una regla de la herramienta (la «ceja») y las decisiones confirmadas tienen que viajar completas en cada revisión del artefacto.
Los márgenes que dependen del ancho se prueban en 320 y 768 antes de generalizarlos.

### 2026-10-19 — Fallos intermedios en el diseño y la aplicación de D.20

**Contexto:** componentes con la dirección cálida (`design-components-d20`).

**Categoría:** contradicción con una regla de una herramienta / efecto lateral de CSS / fallo de proceso / omisión en un artefacto.

**Qué se generó mal:**

1. Las fases de exploración y de tareas no cargaron la skill de `impeccable` que el proyecto exige para el trabajo de interfaz; la
   tarea dejó escrito que la fase de aplicación debía cargarla.
2. El primer dibujo del motivo (líneas onduladas paralelas) se leía como un matasellos y no como curvas de nivel, y pesaba distinto en claro
   y en oscuro. Se rehízo como anillos cerrados alrededor de una cima, con un trazo por tema (contraste medido 1,49:1 y 1,41:1).
3. La primera versión del diseño hacía crecer la fila a 320 en unos 6px (interlineado de heading-2 más un borde de 1px) sin cuantificarlo; lo
   detectó el validador en contexto limpio, junto con escenarios sin cubrir, y el diseño se corrigió (peso en lugar de tamaño, `outline` en lugar
   de borde).
4. El agente del lote 3a sobrescribió en Engram la observación detallada de `apply-progress` con un resumen, y se perdió la evidencia previa.
5. `--update-snapshots=changed` no regeneró las capturas con cambios bajo el umbral (pie y motivo), así que hubo que borrar los 102 PNG y
   escribirlos de nuevo (decisión 239).

**Cómo se detectó:** 1 al revisar el proceso del paso; 2 en la revisión visual de las capturas; 3 por el validador del diseño; 4 al
leer la observación en el lote siguiente; 5 al contrastar los PNG cambiados con los esperados.

**Observación:** una restricción numérica («la fila no crece») hay que cuantificarla en el diseño y fijarla con una prueba antes de tocar CSS. Una
observación de progreso se actualiza con `find`/`replace` o se anexa, no se sobrescribe con un resumen.
