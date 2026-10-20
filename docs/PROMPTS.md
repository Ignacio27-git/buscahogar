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

### 2026-10-20 — Movimiento sutil y cierre de la fase (paso D.21, decisiones 240-244)

**Tipo de tarea:** interfaz (transiciones de color, realce de fila, aparición de avisos, pulido transversal de la fase), barrera de tokens de
movimiento, regeneración de 86 capturas y documentación del sistema de diseño (`DESIGN.md` y `design.json`)
**Forma de especificación:** SDD completo sin fase de investigación, en modo automático y con Engram (`sdd/design-motion-d21/*`); invocado
con `/gentle-sdd-new` y retomado con `/gentle-sdd-continue design-motion-d21` tras agotar la cuota de uso. Revisión visual de las 120 capturas
con seis revisores aislados, una segunda pasada con dos y una comprobación dirigida de 32 PNG. Un solo PR con `size:exception`
**Resultado:** utilizable con retoques. El diseño falló dos veces la validación en contexto limpio (la barrera dejaba transiciones de color en
cualquier selector y afectaba al tema oscuro con la banda; luego el borde de ordenación contradecía el spec) y el flujo automático se detuvo una
vez, como exige. Una afirmación «verificada en código» del diseño (que `router.push` remonta la página) resultó falsa. La revisión visual dio
ocho correcciones menores aceptadas por el responsable (P1-P8) y, en la segunda pasada, una regresión mayor introducida por P8 (chips pegados al
panel de vacío) y tres menores (F1-F4).

**Prompt:** el del paso D.21 de `docs/DESIGN-ROADMAP.md`, literal: «Paso D.21 de docs/DESIGN-ROADMAP.md. Usa `impeccable animate`, `impeccable
polish` e `impeccable document`. Micro-interacciones sutiles: hover de filas e imágenes, transición de color en controles y enlaces, aparición
suave de los avisos y del panel de cobertura. Todo pasa por los tokens de movimiento y queda a cero con `prefers-reduced-motion` (decisión 207).
Enmienda la regla «sin movimiento decorativo» y la decisión 208 en lo que toque. Un solo lote de pulido de toda la fase a los tres anchos y en
ambos temas. DESIGN.md y `.impeccable/design.json` derivados del código entregado. Regenera en Docker las capturas de referencia y revisa su
diferencia una a una; axe a cero.»

**Observación:** limitar las transiciones de color a una lista cerrada de selectores, comprobada en el test de tokens, hizo que el movimiento se
pudiera auditar en el CSS entregado en lugar de revisarse a ojo. Las regresiones del pulido (P8) solo aparecieron mirando capturas, y un test que
solo comprobaba anchos (F2) dejó pasar una separación distinta entre pares.

### 2026-10-19 — Componentes con la dirección cálida (paso D.20, decisiones 235-239)

**Tipo de tarea:** interfaz (motivo SVG, fila de resultado, superficies, icono), cobertura e2e con alturas fijadas, regeneración de 102 capturas
y documentación del sistema de diseño
**Forma de especificación:** SDD con fase de investigación (Engram `sdd/design-components-d20/*`) y cuestionarios al responsable para las
decisiones de producto (SVG incrustado, motivo solo junto al `h1`, etiqueta de operación neutra, superficies sin tokens nuevos, icono `check`, pie
recoloreado). Revisión visual de las 102 capturas con seis revisores aislados y una segunda pasada con dos. Un solo PR con `size:exception`
**Resultado:** utilizable con retoques. El diseño falló una vez la validación en contexto limpio (la fila crecía unos 6px a 320 y faltaban
escenarios) y se corrigió; tras la revisión visual el responsable decidió tres correcciones: el motivo (líneas onduladas paralelas que se leían
como un matasellos) se redibujó como anillos de nivel y se equilibró entre temas, la etiqueta de operación bajó a peso 400 y la banda de la ficha
se alineó con la rejilla de datos.

**Prompt:** el del paso D.20 de `docs/DESIGN-ROADMAP.md`, literal: «Aplica la dirección de D.19 a los componentes sin cambiar comportamiento
ni texto: cabecera de la búsqueda con un motivo sutil de curvas de nivel (SVG propio, servido desde el origen) como único momento decorativo;
fila de resultado con miniatura «Sin foto» con carácter, precio con más presencia y operación; ficha con panel de precio y estados con el verde
y una señal que no dependa del color; paneles de aviso, vacíos, pasos y pie con la nueva paleta. Sin cambios en el orden del DOM, los objetivos
de 40 px ni la accesibilidad.»

**Observación:** fijar las alturas de fila en el e2e antes de tocar CSS (U0) hizo medible la restricción «la fila no crece» y evitó discutirla
a ojo. Lo que la lectura de los tests no detectó salió de mirar las capturas, y `--update-snapshots=changed` dejó pasar los cambios bajo el
umbral (decisión 239).

### 2026-10-15 — Dirección cálida: paleta, tipografía y aprobación (paso D.19, decisiones 230-234)

**Tipo de tarea:** interfaz (tokens, color de estado y fuente propia), cobertura e2e y documentación del sistema de diseño
**Forma de especificación:** SDD con fase de investigación y puerta de aprobación (Engram `sdd/design-warmth-d19/*`): el responsable aprobó
las 12 capturas (inicio, inicio filtrado y ficha, a 320 y 1280, en claro y oscuro) antes de la documentación. Un solo PR con `size:exception`
**Resultado:** utilizable con retoques. La propuesta atribuyó a la decisión 217 lo que enmienda la 132, y la especificación situaba la
regeneración de líneas base después de la puerta, lo que contradice su mecánica; ambos se corrigieron al conciliar. Las capturas de la página
429 hubo que regenerarlas aparte y el gráfico de precios necesitó un ajuste de 4px.

**Prompt:** el del paso D.19 de `docs/DESIGN-ROADMAP.md`, literal: «Paso D.19 de docs/DESIGN-ROADMAP.md (añadido el 2026-10-15). Usa `impeccable
colorize` e `impeccable typeset`. La web se ve demasiado seria y sobria. Refina el mundo de la hoja topográfica, no lo sustituyas […]
Paleta cálida en globals.css […] Tipografía: una familia propia autoalojada con `next/font/local` […] Radios algo más amables […] Todo par
texto/fondo cumple WCAG 2.2 AA en ambos temas. Parada de aprobación […] Registra las enmiendas en DECISIONS.md, PRODUCT.md y DESIGN.md».

**Observación:** el paso enmendaba compromisos escritos (pila del sistema, un único azul). Separar «acento interactivo» de «estado favorable»
resolvió la contradicción sin un segundo acento. Las cajas de ancho fijo y la fuente nueva solo se probaron de verdad con medidas en e2e, no con
los tests unitarios.

### 2026-10-15 — Planificación de la fase de calidez (bloque 7, pasos D.19-D.21)

**Tipo de tarea:** planificación de diseño (sin código)
**Forma de especificación:** prosa abierta más un cuestionario de decisiones (alcance, tipografía, movimiento y organización)
**Resultado:** utilizable sin cambios

**Prompt:** «una vez hemos acabado con la implementación de los roadmap la aplicación la veo bien, y funciona, pero siento que le
falta vida al diseño, lo veo demasiado serio y sobrio, preferiría que sin ser nada extravagante tuviera más vida y fuera más bonito»,
y a mitad de la tarea: «¿veo mejor realizar otro roadmap para hacer este proceso, o ves mejor otra forma?».

**Observación:** el prompt pedía un cambio que chocaba con compromisos escritos (decisión 132, PRODUCT.md y las reglas de DESIGN.md
de un único azul, sin marginalia y sin movimiento). Antes de tocar código, el agente sacó esas contradicciones en forma de decisiones
explícitas en lugar de suavizarlas: refinar frente a un mundo nuevo, fuente propia frente a la del sistema y movimiento sí o no. Las
capturas de referencia del e2e suplieron una base de datos local vacía para ver la búsqueda con resultados y la ficha.

### 2026-10-14 — Seguimientos de diseño (paso D.18, decisiones 217-229)

**Tipo de tarea:** interfaz (lote estructural), correcciones de semilla y fuentes, cobertura e2e y documentación del sistema de diseño
**Forma de especificación:** SDD con fase de investigación (Engram `sdd/design-followups-d18/*`) y puertas del orquestador con revisión
individual de cada captura (G-A 120, G-B 18, G-C 12 con una segunda revisión, G-D 106 más dos rondas de pulido de 54 y 24). Dos PR partidos por
commits en la misma rama: A-C (fuentes, semilla, marca) y D-F (lote estructural, `DESIGN.md` y documentación), este último con `size:exception`
**Resultado:** utilizable con retoques. La unidad C se rehízo dos veces (la línea de marca sobre el título contradecía la regla de impeccable
contra la «ceja»; después la franja estrechó el bloque centrado) y tras la puerta G-D hubo dos rondas de pulido: hueco de la barra, margen del
aviso de cobertura y una única acción en el vacío (decisión del responsable).

**Prompt:** «continúa con los pendientes registrados»: los 16 seguimientos que D.17 dejó anotados, tratados como un nuevo paso D.18.

**Observación:** un lote tan grande solo fue revisable porque se partió en unidades con una regeneración de capturas por unidad y una puerta
cada una. La mayor parte de los retoques salió de mirar las capturas, no de los tests.

### 2026-10-13 — Pulido final y DESIGN.md (paso D.17, decisiones 209-216)

**Tipo de tarea:** interfaz (un lote de pulido tras una crítica), tokens, cobertura e2e de las páginas autónomas y documentación del
sistema de diseño
**Forma de especificación:** SDD (explorar, investigar, proponer, especificar, diseñar, tareas y aplicar en tres lotes; Engram
`sdd/design-polish-d17/*`) con dos puertas del orquestador: la crítica de `impeccable` con dos agentes y `document` con el Norte creativo
y los nombres de color confirmados por el responsable. Un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques. El lote redujo los objetivos de la cabecera a 32 px contra la decisión 200 y se revirtió en la
puerta. La revisión captura a captura se dio dos veces por incompleta (56 de 108, y luego por límites de medios) y la rehicieron seis
revisores aislados. Una corrección posterior alineó el marco del mapa vacío con la lista (`home-filtered`). El informe de la crítica y sus
preguntas se entregaron primero en inglés.

**Prompt:** el del paso D.17 de `docs/DESIGN-ROADMAP.md`, literal: «Paso D.17 de docs/DESIGN-ROADMAP.md. Usa `impeccable critique`,
`impeccable polish` e `impeccable document`.

- Crítica y pulido de todas las pantallas a los tres anchos y en ambos temas, con un solo lote de correcciones.
- DESIGN.md en la raíz, derivado del código entregado (tokens reales de globals.css y componentes), no de intenciones.
- Elimina estilos y tokens sin uso.
- Regenera en Docker las capturas de referencia finales y revisa su diferencia una a una.
- Actualiza la sección «Capa web» de docs/ARCHITECTURE.md si ha cambiado algo estructural.»

**Observación:** la crítica puntuó 28/40 y casi todo el valor estuvo en tres cosas que un detector no ve: la zona sin datos que el chip
presentaba como aplicada, el mismo estado de un anuncio con tres palabras y un marco de mapa desalineado. Dos lecciones de proceso: la
revisión de capturas «una a una» no se puede delegar en un solo agente con muchas imágenes (se pierde cobertura sin avisar) y un criterio
ya decidido (40 px, decisión 200) tiene que viajar con la tarea o un lote lo contradice.

### 2026-10-13 — Movimiento (paso D.16, decisiones 205-208)

**Tipo de tarea:** interfaz (tokens y transiciones CSS), mapa (opciones de Leaflet y parche del teclado), pruebas estáticas, unitarias y e2e
**Forma de especificación:** SDD (explorar, investigar, proponer, especificar, diseñar, tareas y aplicar en dos lotes; Engram
`sdd/motion-d16/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques. El diseño daba por existente el campo `module` del `package.json` de Leaflet para el test de
contrato (no lo declara; se corrigió al conciliar las tareas y el test lee el fichero de `require.resolve`). Un script con `heredoc`
volvió a convertir `\b` de unas expresiones regulares en retrocesos y se detectó con la guarda en rojo. El espec e2e comparaba `100ms`
y el build minimiza a `.1s`. La previsión de ~770 líneas se quedó en 1.089 de código y tests más la documentación.

**Prompt:** el del paso D.16 de `docs/DESIGN-ROADMAP.md`, literal: «Paso D.16 de docs/DESIGN-ROADMAP.md. Usa las skills emil-design-eng y
animate (o `impeccable animate`). Movimiento sobrio: es una herramienta de uso frecuente.

- Solo CSS, sin bibliotecas de animación. Tokens de duración en globals.css: unos 100 ms para respuesta, 200-300 ms para paneles y la
  bandeja, nunca más de 400 ms. ease-out al entrar y ease-in al salir. Solo transform y opacity.
- @starting-style para la bandeja y los <details>.
- prefers-reduced-motion quita todo movimiento no esencial.
- Nada se anima en respuesta a acciones de teclado repetidas.
- Transiciones de vista: evalúalas solo si no exigen un componente de cliente ni un flag experimental en Next 16.3.4 (compruébalo en
  node_modules/next/dist/docs). Las transiciones entre documentos no funcionan en Firefox.»

**Observación:** el brief pedía `@starting-style` y la investigación empírica mostró que solo sirve para fundir al cargar una bandeja
renderizada abierta, así que se omitió (desviación registrada). Lo difícil no era el CSS sino el teclado del mapa: el pan por flechas es
JavaScript de Leaflet y solo se apaga envolviendo una función privada, lo que obligó a fijar la versión y a escribir un test de contrato.
Una prueba e2e escrita después de la implementación se demuestra en rojo revirtiendo temporalmente la implementación, no suponiendo que
falla.

### 2026-10-09 — Accesibilidad WCAG 2.2 AA (paso D.15, decisiones 193-202)

**Tipo de tarea:** auditoría y corrección de accesibilidad (interfaz, mapa, galería), configuración de lint y e2e
**Forma de especificación:** SDD (explorar, proponer, especificar, diseñar, tareas y aplicar en tres lotes y diez unidades; Engram
`sdd/a11y-wcag22-d15/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques. Hubo que mantener siete desactivaciones de `jsx-a11y` en `price-history.tsx` (el diseño
preveía tres), corregir el conmutador «Ver mapa/Ver lista» (20 px de alto aunque axe pasaba; no estaba en el diseño), escribir un
puente de prueba para renderizar `error.tsx` y `global-error.tsx` bajo el runtime JSX de Playwright y arreglar una expresión regular
`\b` rota que se había confirmado en `5f8301b` (corregida en `c7c023e`). La lista manual la hizo el responsable con el Narrador de
Windows en vez de NVDA (no se pudo instalar), contra la base de los e2e porque la de desarrollo está vacía. **Tras la pasada manual**
fallaron dos puntos (error sin anuncio ni foco; campos numéricos sin aviso de «solo cifras») y se corrigieron en un lote de
remediación (decisiones 203 y 204, commits `0bd0094` y `810fa58`), con la opción elegida por el responsable. En la segunda pasada,
13 de 13 puntos aprobados; paso cerrado.

**Prompt:** el del paso D.15 de `docs/DESIGN-ROADMAP.md`, literal: «Paso D.15 de docs/DESIGN-ROADMAP.md. Usa `impeccable audit`,
`impeccable harden` e `impeccable adapt`.

- axe con wcag22aa sin violaciones en todas las rutas, anchos y temas de la suite de D.1.
- Lista de comprobación manual, anotada en las notas: recorrido completo con teclado; pasada breve con lector de pantalla; zoom al 200 %
  y reflujo a 320 px; foco no tapado por la cabecera fija (2.4.11); objetivos de 24 px (2.5.8); dibujo sin arrastre (2.5.7); mensajes de
  estado (4.1.3); mapa y galería.
- Decide si se incorpora eslint-plugin-jsx-a11y, aplazado en la decisión 011.
- Un solo lote de correcciones.»

**Observación:** la línea base de axe ya estaba vacía, así que «cero violaciones» no era el trabajo real: lo eran los estados que axe
nunca recorría (bandeja abierta, alertas, ventana emergente, páginas de error) y lo que axe no detecta (nombre y ayuda del mapa, foco de
la galería, tema activo). La prueba de caja de 24 px encontró un fallo de 2.5.8 que axe daba por bueno. Medir antes de arreglar
también eximió la mitad de F5 (etiquetas del mapa) sin cambiar código.

### 2026-10-09 — Estados globales: 404, error, vacío, parámetros inválidos y 429 (paso D.14, decisiones 186-192)

**Tipo de tarea:** interfaz (páginas de estado, estado vacío), copy (parámetros inválidos, mensajes de core), proxy (429) y e2e
**Forma de especificación:** SDD (explorar, investigar, proponer, especificar, diseñar, tareas y aplicar en nueve unidades; Engram
`sdd/global-states-d14/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques, tras varias rondas de puerta. La investigación pasó por alto que un `loading.tsx` raíz envuelve
a los layouts anidados (se detectó en la propuesta); el diseño propuso `loading.tsx` sin contar con el streaming sin JavaScript y el
spike de la fase 0 lo descartó (decisión 191, rechazada); en la aplicación se corrigieron el copy de `error.tsx` (suponía filtros y
usaba «dirección») y el mecanismo de Zod descrito en la especificación.

**Prompt:** el del paso D.14 de `docs/DESIGN-ROADMAP.md`, literal: «Usa `impeccable harden` e `impeccable onboard` para el estado
vacío. loading.tsx en / y en la ficha, con esqueletos hechos con tokens […]; error.tsx en la raíz […]; not-found.tsx en la raíz y en la
ficha, con salida hacia la búsqueda; global-error.tsx con su propio `<html>` y `<body>` […]; resultados vacíos con orientación sobre qué
cambiar; 429: una página mínima en español que conserva el estado 429 y sus cabeceras» — invocado vía `/gentle-sdd-new`.

**Observación:** el prompt pedía `loading.tsx`, pero sin JavaScript el contenido de Next queda oculto en un `<div hidden>` mientras
la carga transmite: un spike descartable antes de construir ahorró retirar el esqueleto después. Cuando una pieza depende de un
comportamiento del framework que no se ha medido, la primera tarea es medirlo.

### 2026-10-08 — Correcciones de la auditoría del suelo de oficio (paso D.13b, decisiones 183-185)

**Tipo de tarea:** interfaz (CSS base, iconos, ficha, cabecera de búsqueda), copy y dominio mínimo (tope de reintentos en core) + capturas
**Forma de especificación:** SDD (explorar, investigar, proponer, especificar, diseñar, tareas y aplicar en siete unidades; Engram
`sdd/craft-floor-fixes-d13b/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques. Las puertas de especificación y diseño corrigieron cosas antes de aplicar (la reserva de foco
solo desde 64rem, el comportamiento del job agotado, el límite de chips largos a 320 px, el nombre del archivo de iconos del mapa).
En la aplicación: el directorio `coverage/` estaba ignorado por git (renombrado), la tabla del histórico seguía desbordando 8 px en
P7 sin `nowrap` (se aplicó la alternativa apilada) y el chip de solo lectura tenía un test fijado a la clase anterior.

**Prompt:** el del paso D.13b de `docs/DESIGN-ROADMAP.md`, literal: «Carga impeccable y lee reference/craft-floor.md antes de editar UI,
en el diseño y en la aplicación. Corrige los hallazgos de la auditoría de D.0-D.13 (notas de este paso), en este orden: capa base de
controles; iconos dibujados; ficha; cabecera de la búsqueda; texto» — invocado vía `/gentle-sdd-new`.

**Observación:** los hallazgos que el detector no ve (relleno, hover, iconos, ritmo) se cierran con tests de CSS leído como texto y
con una pasada a ojo por las capturas; `impeccable detect` queda en cero hallazgos y sin ignores.

### 2026-10-08 — Auditoría de D.0-D.13 contra el suelo de oficio de impeccable (origen del paso D.13b)

**Tipo de tarea:** auditoría de diseño (solo lectura)
**Forma de especificación:** prosa breve; el criterio es `reference/craft-floor.md` de impeccable, con el contrato visual de la
decisión 132 por encima
**Resultado:** utilizable sin cambios. Se comprobaron a mano en el código los hallazgos 1, 3, 5, 7 y 13.

**Prompt:**

> si, vamos con la auditoría, desde D.0 hasta D.13

(Respuesta a la pregunta de si auditar lo construido, tras descubrir que solo D.3 había cargado `craft-floor.md`.)

**Observación:** `impeccable detect` y axe no encuentran nada, pero la revisión de las capturas y del CSS da 7 hallazgos importantes y
7 menores, todos visuales o de estructura (controles sin relleno, recuadro anidado, iconos con caracteres, sin hover, panel fijo que
corta la comparación, ritmo de la cabecera, escala de «Ubicación»). Uno lo introdujo la propia decisión 182: el aviso de D.12 queda
como recuadro dentro del panel fijo de la ficha. El responsable decide corregirlos en un paso nuevo, D.13b, antes de D.14.

### 2026-10-08 — Avisos sin regla lateral (seguimiento de D.12 y D.13, decisión 182)

**Tipo de tarea:** corrección de diseño (CSS) + capturas
**Forma de especificación:** prosa con la dirección fijada por el responsable (reutilizar el panel de aviso de D.7) y el hallazgo del detector como criterio de cierre; trabajo directo, sin SDD
**Resultado:** utilizable sin cambios.

**Prompt:**

> hay que hacer caso siempre lo que indique impeccable, para eso usamos esta skill

(Tras el hallazgo `side-tab` del hook de impeccable sobre `.source-list__warning` (D.12) y `.coverage-notice` (D.13).)

**Observación:** la corrección es una regla compartida con `.nl-review__alert` y `.nl-issues`; `impeccable detect` queda sin
hallazgos y solo cambian las 42 capturas previstas (36 `coverage-*` y 6 `detail-gallery`). El fallo de origen está en `AI-NOTES.md`.

### 2026-10-08 — Avisos de cobertura (paso D.13, decisión 181)

**Tipo de tarea:** interfaz (componente de servidor, CSS y módulo de hora) + cableado de la página + siembra e2e + rutas y capturas
**Forma de especificación:** SDD (explorar, investigar, proponer, especificar, diseñar, tareas y aplicar en siete unidades; Engram `sdd/coverage-notices-d13/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques: las puertas de especificación y diseño corrigieron cuatro cosas antes de aplicar (la cita de la decisión 135, el recuento de 10 variantes, la palabra de día en el reinicio del tope y el título de «solicitud registrada»); la aplicación no necesitó retoques de diseño.

**Prompt:**

> Paso D.13 de docs/DESIGN-ROADMAP.md. Usa `impeccable clarify`.
>
> - Un componente de aviso con variantes para los cuatro mensajes de cobertura (zona no barrible, tope agotado, tope del cliente agotado, solicitud registrada) y el estado del trabajo. role=status para el progreso; role=alert solo para lo que exige atención.
> - Fechas en hora local con Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid' }) en lugar de ISO; «00:00 UTC» pasa a hora local.
> - Estado de progreso mientras llegan resultados, y se conserva el enlace de recarga sin JS.
> - CoverageStatus (coverage-status.tsx) sigue siendo el único cliente de este flujo.

**Observación:** la propuesta decía «11 variantes» y eran 10; el traspaso citaba la decisión 122 donde era la 135 (ver `AI-NOTES.md`). El
RED de cada unidad se vio fallar antes del GREEN. La fecha de siembra inyectada (decisión 181, enmienda la 135) nació de que el tope
global exige un job «de hoy» y el e2e no puede escribir.


### 2026-10-07 — Ficha: comparación de anuncios de origen (paso D.12, decisión 180)

**Tipo de tarea:** dominio puro (`packages/core`) + interfaz (componente y CSS) + test de consistencia con PostgreSQL + e2e y capturas
**Forma de especificación:** SDD (explorar, proponer, especificar, diseñar, tareas y aplicar en seis unidades; Engram `sdd/source-comparison-d12/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable sin cambios.

**Prompt:**

> Paso D.12 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): convierte la lista de anuncios de origen en una comparación.
>
> - Para cada anuncio: fuente, precio, última vez visto, número de fotos y estado.
> - Destaca el más económico de los anuncios activos (decisión 109), calculado en packages/core, con empates resueltos de forma explícita. Si no hay ninguno activo, muestra el mínimo de todos con un aviso.
> - El texto distingue «anuncio» de «vivienda» y no presenta la agrupación como una certeza: la prioridad del proyecto es evitar falsos positivos.

**Observación:** el RED de cada unidad se vio fallar antes del GREEN, también en el e2e (`falta la ruta detail-single`). Al decidir
el modo de entrada vacía, el diseño y la especificación discrepaban y se resolvió a favor del diseño. Las capturas revelaron que a
1280 px el panel lateral de P7 se desplaza por dentro y recorta la segunda fila.



### 2026-10-07 — Ficha: guardas del mapa estático (paso D.11, seguimiento, decisión 179)

**Tipo de tarea:** test (guardas estáticas en `apps/web/test/map-guards.test.ts`)
**Forma de especificación:** aviso de la verificación de D.11 (el diseño preveía fijar el import, la atribución y la lista sin `fetch`);
unidad acotada de SDD, test primero con el rojo demostrado mutando el fuente
**Resultado:** utilizable sin cambios.

**Prompt:**

> Fija en `map-guards` el import de `lib/osm-tiles`, la atribución y la lista sin fetch/innerHTML del mapa estático
> `property-location.tsx`, sin meterlo en `MAP_FILES` (SMV-22 intacta).

**Observación:** las guardas pasan en verde sobre el código existente, así que el rojo se probó rompiendo a propósito el fuente y
restaurándolo. Un heredoc de shell volvió a convertir `\b` en retroceso dentro de una regex y hubo que corregirlo.

### 2026-10-07 — Ficha: mapa de ubicación aproximada (paso D.11, decisión 179)

**Tipo de tarea:** geometría pura (`packages/core`) + consulta SQL + interfaz (mapa estático del servidor, SVG y CSS) + guardas + test + capturas e2e
**Forma de especificación:** SDD (explorar, proponer, especificar, diseñar con puerta de diseño, tareas y aplicar en siete unidades; Engram `sdd/location-map-d11/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques — la puerta de diseño corrigió el valor esperado de P1, la función `latLonToTile` que faltaba, la normalización de la longitud 180, el caso de zoom 0 y un precedente de ESLint inexistente; ver `docs/AI-NOTES.md`. El prompt del paso (envoltorio de cliente) ya estaba superado por la 133.

**Prompt:**

> Paso D.11 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): un mapa de ubicación en la ficha.
>
> - Las coordenadas pueden ser aproximadas: muestra un área, no un punto exacto, con el aviso «Ubicación aproximada».
> - Prefiere reutilizar el envoltorio de cliente search-map.tsx con props antes que crear otro. Si hace falta un fichero de cliente nuevo, amplía el allowlist y registra la decisión (R4).
> - Carga diferida (next/dynamic, ssr: false), atribución de OSM visible y alternativa noscript con el municipio.

**Observación:** la 133.7 sustituyó el envoltorio de cliente por un mapa estático del servidor, sin JS; el responsable aceptó el radio de 500 m provisional aunque la 133 pedía fijarlo con datos reales (conflicto registrado en la 179). Geometría, consulta y módulo de teselas salieron con el test en rojo antes. Los casos e2e se escribieron después del componente, no antes. Las 18 capturas de ficha cambian y se revisaron a ojo.

### 2026-10-07 — Ficha: histórico de precios (paso D.10, decisión 178)

**Tipo de tarea:** consulta SQL + dominio (`packages/core`) + interfaz (tabla accesible y gráfico SVG del servidor) + test + capturas e2e
**Forma de especificación:** SDD (explorar, proponer, especificar, diseñar, tareas, aplicar en dos lotes y verificar; Engram `sdd/price-history-d10/*`), un solo PR con `size:exception` aceptado por el responsable
**Resultado:** utilizable con retoques — la puerta de diseño corrigió el orden de las filas de la tabla (el diseño las intercalaba por fecha, contra la especificación, que las agrupa por anuncio) y el nombre accesible del SVG (el diseño lo ocultaba con `aria-hidden`); ver `docs/AI-NOTES.md`.

**Prompt:**

> Paso D.10 de docs/DESIGN-ROADMAP.md. Función nueva (decisión 131): muestra en la ficha el histórico de precios de los anuncios de la vivienda.
>
> - Consulta nueva en packages/db/src/detail.ts sobre listing_versions de todos los anuncios de la vivienda, ordenada por fecha y con su fuente, con tests en packages/db/test/detail/detail.db.test.ts. Cubre un anuncio retirado y uno redactado: la decisión 107 conserva los precios, así que su histórico se sigue mostrando.
> - Lo que se derive (cambios, variación) va en packages/core, sin Next ni ORM.
> - Presentación: primero una tabla accesible (con caption y encabezados) que funciona sin JS; si aporta, un gráfico SVG sencillo renderizado en el servidor. Diseña el caso de una sola versión.
> - Comprueba que el rol de solo lectura puede leer listing_versions.

**Observación:** el «si aporta» del prompt quedó superado por la 133.6 (gráfico y tabla, los dos). La capa db, la derivación y los helpers de geometría salieron a la primera con test en rojo antes; lo que costó fue la presentación: ni `detail` (P2) ni `detail-gallery` (P7) tienen cambios de precio, así que sin una ruta e2e sobre P1 el gráfico no habría salido en ninguna captura ni en axe. A 320 px la tabla de P7 desbordaba por pocos píxeles y se añadió la región con foco que el diseño reservaba.

### 2026-10-06 — Resultados: número de fuentes activas (paso D.9, seguimiento, decisión 177)

**Tipo de tarea:** consulta SQL (subconsulta de `search.ts`) + test + capturas e2e
**Forma de especificación:** elección del responsable en una pregunta cerrada sobre la consecuencia que dejó abierta la decisión
176; implementación directa delegada (sin SDD), test primero
**Resultado:** utilizable sin cambios.

**Prompt:**

> Sí, alinearlo

(respuesta a si el recuento de fuentes de la búsqueda debía coincidir con el de la ficha: P2 decía «2 fuentes» en los
resultados y «1 fuente» en su ficha).

**Observación:** bastó un `AND src_l."status" = 'active'` en la subconsulta, con el mismo literal que `visibility.ts`. El mapa
no proyecta ningún recuento. Cambiaron solo las capturas de `home` (seis) y las de `map` a 1280 (dos), donde se ve la fila de P2;
`home-filtered` no la incluye y bajo 64rem `map` solo enseña el mapa.

### 2026-10-06 — Ficha: número de fuentes activas (paso D.9, corrección, decisión 176)

**Tipo de tarea:** interfaz (función pura en `apps/web/src/lib`, resumen de la ficha) + test + capturas e2e
**Forma de especificación:** prosa breve sobre una observación ya registrada en las notas de D.9; el texto de la interfaz lo
fijó el responsable; implementación directa delegada (sin SDD), test primero
**Resultado:** utilizable sin cambios.

**Prompt:**

> corrígelo

(referido a la observación de D.9: «Disponible en N fuentes» contaba todos los anuncios, también los no activos, y P7 decía
«2 fuentes» con las dos «(no disponible)»).

**Observación:** el número sale de las fuentes que la página ya carga (`countActiveSources`), sin tocar `packages/db`. Solo
cambiaron las doce capturas de `detail` y `detail-gallery`. La búsqueda sigue contando fuentes distintas de todos los anuncios;
queda anotado en la decisión 176.

### 2026-10-06 — Ficha: avisos de la verificación de D.9 (galería en capturas, sin JS y foco no tapado)

**Tipo de tarea:** test (siembra e2e, capturas, e2e sin JavaScript y de accesibilidad)
**Forma de especificación:** prosa breve con los dos avisos de la verificación; implementación directa delegada (sin SDD)
**Resultado:** utilizable con retoques — la ventana baja propuesta (1280×600) no obligaba al panel a desplazarse y se bajó a
1280×480; ver `docs/AI-NOTES.md`. Ningún defecto de producto.

**Prompt:**

> soluciona estos puntos
>
> 1. Las capturas e2e no enseñan la galería, el «—» de los datos que faltan ni la nota única «No consolidado — ver anuncios de
>    origen», porque la siembra e2e no tiene miniaturas y tiene todos los datos. Solo los cubren los tests unitarios.
> 2. No hay ningún test automático de que el panel lateral sticky no tape el foco del teclado, ni de la navegación de la
>    galería sin JavaScript.

**Observación:** la clave fue elegir una vivienda solo con anuncios inactivos sin redactar (decisión 175): sale en su ficha pero
no en la búsqueda, así que las capturas nuevas no movieron ninguna línea base existente.

### 2026-10-06 — Ficha: presentación (paso D.9, decisiones 171-174)

**Tipo de tarea:** implementación de un paso de diseño (interfaz de servidor, CSS, orden en una consulta SQL, e2e)
**Forma de especificación:** paso de la hoja de ruta con viñetas (`docs/DESIGN-ROADMAP.md`, D.9) pegado en `/gentle-sdd-new`;
cadena SDD completa y aplicación en tres lotes y siete unidades de trabajo, TDD estricto, un solo PR con `size:exception`
**Resultado:** utilizable con retoques — la puerta de revisión del diseño devolvió correcciones (texto de la insignia,
premisa falsa sobre los enlaces del mapa, repetición de «No consolidado», rótulo de planta); ver `docs/AI-NOTES.md`.

**Prompt:**

> `/gentle-sdd-new` Paso D.9 de docs/DESIGN-ROADMAP.md. Aplica la presentación de la ficha decidida en D.0 (está en las
> notas de este paso). Usa `impeccable layout`, `impeccable typeset` y `impeccable clarify`. [viñetas: cabecera estructurada,
> galería APG, lista de anuncios de origen con insignia, vuelta a los resultados]

**Observación:** el diseño pasó por una ronda de correcciones antes de aplicar (revisión 2). En la aplicación los fallos fueron
de herramienta (barras invertidas perdidas en el shell) y de proceso (un trailer `Co-Authored-By` indebido), no de producto.

### 2026-10-06 — Mapa: dibujo de zona accesible (paso D.8b, decisiones 168-170)

**Tipo de tarea:** diseño y accesibilidad (SDD): reductor, control de teclado, mira, hoja CSS, guardas y e2e
**Forma de especificación:** SDD en modo automático (exploración, propuesta, especificación, diseño y tareas, en tres unidades
de trabajo); el prompt del paso D.8b de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto, un solo PR con
`size:exception` aceptado por el responsable. La planificación (de la exploración al diseño) se hizo en una sesión anterior y
esta retomó desde la validación del diseño.
**Resultado:** utilizable con retoques (el diseño suponía una API de estado de ventana emergente inexistente en el `Map` de
Leaflet; el e2e destapó que las clases de las capas vectoriales no llegaban al SVG)
**Prompt:**

> `/gentle-sdd-new` Paso D.8b de docs/DESIGN-ROADMAP.md. Usa `impeccable harden`.
>
> - Teselas en tema oscuro según el resultado de D.2: filtro solo en el panel de teselas, o su alternativa. Marcadores,
>   controles y atribución sin filtrar.
> - Dibujo de zona accesible: sin arrastrar (WCAG 2.5.7, un clic por vértice) y con una alternativa de teclado; por
>   ejemplo, una mira en el centro que se mueve con las flechas y un botón «Añadir vértice». Botones de al menos 24 px y
>   mensajes con role=status.
> - La lógica nueva va al reductor draw-polygon-state.ts, con tests.

**Observación:** el prompt pedía teselas oscuras, pero D.2 ya había resuelto lo contrario (decisión 140: teselas claras en un
marco oscuro, sin filtro), así que el primer punto se cerró sin código. Lo difícil estaba en el segundo: la interacción con
Leaflet (Escape con una ventana abierta, orden de foco, anfitrión antepuesto a un marco del servidor) no se podía decidir
en papel, y el e2e en Docker lo comprobó con una puerta de consola. Las decisiones 168-170 reparten los diez puntos del
diseño (B1 a B10).

### 2026-10-06 — Pendientes de D.8a: guarda de la CSP y arranque de D.8b

**Tipo de tarea:** test (corrección de una guarda) y planificación SDD de D.8b
**Forma de especificación:** prosa breve que remite a los pendientes del informe de cierre de D.8a
**Resultado:** con retoques (la guarda quedó corregida en un commit aparte; D.8b se dejó planificado hasta la especificación y
el diseño, sin implementar, por falta de cuota)
**Prompt:**

> soluciona los dos puntos que me indicas que están pendientes

**Observación:** «los dos puntos» mezclaba un arreglo de una línea con un paso entero de la hoja de ruta (D.8b, tamaño L).
Se resolvió el primero de inmediato y se preguntó cómo abordar el segundo. El responsable eligió SDD, como en D.8a. Al
reemplazar el byte de retroceso desde la shell, dos intentos (perl y Python con secuencias de escape) no cambiaron nada sin
dar error. Solo funcionó escribir los bytes por su valor numérico, y se confirmó con `git diff`.

### 2026-10-06 — Mapa: disposición y marcadores (paso D.8a, decisiones 163-167)

**Tipo de tarea:** implementación (vista dividida lista + mapa, marco adaptable, marcadores, popup y barra de dibujo con tokens)
con tests unitarios, de guardas estáticas y e2e
**Forma de especificación:** SDD en modo automático con las decisiones de producto confirmadas por el responsable antes de la
propuesta; el prompt del paso D.8a de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto, dos unidades de trabajo
(A: datos, disposición, marco y avisos; B: marcadores, popup, barra, guardas y e2e) en dos commits de un solo PR con
`size:exception` aceptado por el responsable.
**Resultado:** con retoques (la especificación y el diseño necesitaron correcciones del orquestador antes de las tareas: `alt`
exigido a un `divIcon`, 25 resultados por página cuando son 24, un recuento por vista contrario a la matriz de avisos; y el
artefacto de tareas bloqueó la aplicación por una expresión regular que el despachador leyó como ruta; ver `docs/AI-NOTES.md`)
**Prompt:**

> `/gentle-sdd-new` Paso D.8a de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable adapt`.
>
> - Disposición según D.0. Por defecto: vista dividida lista + mapa en escritorio, sin
>   superposiciones que tapen el mapa, y lista primero con conmutador hacia el mapa en
>   móvil. El conmutador sigue siendo un enlace con el parámetro view. Si la vista
>   dividida necesita las dos consultas en la misma petición, mide el coste frente a los
>   objetivos del paso 2.4.
> - Altura del mapa adaptable, en lugar del MAP_STYLE fijo de 520 px de
>   search-map-canvas.tsx.
> - Etiquetas de precio y grupos de map-cluster-layer.tsx con variables CSS en lugar de los
>   colores hexadecimales en línea. Sigue creando nodos con textContent, nunca HTML en
>   cadena (map-guards.test.ts).
> - Marcadores con título descriptivo, popup diseñado y estado de carga de search-map.tsx.
> - Barra de dibujo de map-draw-control.tsx (hoy TOOLBAR_STYLE en línea) con los tokens.
> - Mantén literal el host de teselas y la atribución de OSM, y la alternativa noscript.

**Observación:** el prompt no decía qué avisos van en cada panel cuando lista y mapa conviven, ni si el mapa se monta oculto bajo
64rem; salió de las decisiones de producto y de la matriz de avisos de la especificación (SMV-17). Que la barra de dibujo
tuviera que salir del contenedor de Leaflet para poder usar el token de capa, y que el reencuadre del mapa oculto necesitara un
`ResizeObserver`, no estaban en el prompt ni en el diseño inicial. Tests y documentación superaron las 800 líneas (~885
autoradas, sin contar las capturas).


### 2026-10-06 — Búsqueda en lenguaje natural: interpretación y confirmación (paso D.7, decisiones 157-162)

**Tipo de tarea:** implementación (indicador de pasos, panel de revisión, estados de la zona y CSS) con tests unitarios y e2e
**Forma de especificación:** SDD en modo automático, con las decisiones de producto confirmadas por el responsable antes de
la propuesta; el prompt del paso D.7 de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto, tres unidades de
código y una de documentación, un solo PR con `size:exception` aceptado por el responsable.
**Resultado:** con retoques (el pedido de «texto de ejemplo en el campo» pasó a ser texto de ayuda persistente; la validación
de especificación y diseño corrigió una contradicción de «No he entendido:», un texto de «varios municipios» y la
comprobación del inicio; una segunda ronda de capturas por el espaciado a 320 px)
**Prompt:**

> `/gentle-sdd-new` Paso D.7 de docs/DESIGN-ROADMAP.md. Usa `impeccable clarify` y `impeccable layout`.
>
> Rediseña la rama ?q= del paso 3.1 sin cambiar su comportamiento: interpreta y pide confirmación, nunca busca (decisión 122).
>
> - Pasos visibles: describe, revisa y busca. Texto de ejemplo en el campo y un nombre claro para el botón, que hoy dice
>   «Interpretar» (acordarlo conmigo).
> - La interpretación se muestra como campos editables agrupados y como resumen con los mismos componentes de D.6a.
> - Lo no reconocido y los conflictos, con jerarquía visual y role=status o role=alert según corresponda.
> - Elección de lugar inequívoca cuando hay varias coincidencias.
> - Sin JavaScript. No toques el intérprete de packages/core ni su corpus.
>
> Decisiones acordadas: botón «Convertir en filtros»; ejemplo como texto de ayuda persistente («Piso en alquiler en Getafe hasta
> 900 € con 2 habitaciones»); pasos solo en el inicio y en `?q=`; estado único que menciona la zona pendiente; títulos de grupo
> como preguntas; «Sin zona (cualquier municipio)».

**Observación:** el prompt no decía dónde mostrar los pasos, qué hacer con un único candidato por prefijo ni cómo distinguir
«sin lugar» de «lugar no encontrado»; salió del diseño y de las decisiones del responsable. Los tests triplicaron la
previsión de líneas por la cantidad de escenarios de la especificación.


### 2026-10-06 — Resultados: filas densas, paginación y bandeja de filtros (paso D.6b, decisiones 152-156)

**Tipo de tarea:** implementación (fila de resultado, paginador, bandeja `<details>` y CSS) con tests unitarios y e2e
**Forma de especificación:** SDD en modo automático (propuesta, especificación, diseño y tareas, en siete fases); el prompt
del paso D.6b de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto, un commit por fase, un solo PR con
`size:exception` aceptado por el responsable.
**Resultado:** con retoques (la rejilla de una a tres columnas del prompt se sustituyó por filas densas, decisión 132; el
recuento de la lista perdió su « · página N» porque ahora lo dice el paginador; un fichero de e2e salió truncado al
escribirlo con un heredoc y lo detectó `next build`)
**Prompt:**

> `/gentle-sdd-new` Paso D.6b de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable clarify`.
>
> - Tarjeta de resultado: precio destacado (format-price.ts), etiquetas en español para el tipo y la operación (hoy salen
>   «flat» y «rent»), insignia «Disponible en N fuentes», imagen con next/image y sizes, y un estado sin imagen diseñado. Un
>   único enlace por tarjeta, con foco y hover visibles. Decide la política de alt: decorativa solo si el texto de la
>   tarjeta ya lo dice todo.
> - Rejilla de una, dos o tres columnas según el ancho.
> - Orden y paginación con anterior y siguiente claros e indicador de página.
> - Bandeja de filtros en móvil sin JavaScript: <details>/<summary> con la etiqueta «Filtros» y el número de filtros
>   activos, que contiene el formulario de D.6a. La actualización en vivo exigiría un componente de cliente (R4) y queda
>   fuera salvo decisión expresa.

**Observación:** el prompt no fijaba qué cuenta como «filtro activo» (decisión 154), cuándo se oculta el paginador (156), ni
qué hacer en un navegador sin `::details-content` (153); las tres respuestas salieron del diseño. Dos riesgos se comprobaron
al aplicar y no solo en papel: que Lightning CSS conservara `@supports selector(::details-content)` (`next build`) y que la
bandeja se comportara igual en Chromium y Firefox (e2e en Docker).

### 2026-10-05 — Búsqueda: barra de filtros, filtros aplicados y recuento (paso D.6a, decisión 151)

**Tipo de tarea:** implementación (extracción de componente, barra de filtros GET, filtros aplicados, recuento y CSS) con
tests unitarios y e2e
**Forma de especificación:** SDD en modo automático (propuesta, especificación, diseño y tareas, en cinco unidades de
trabajo); el prompt del paso D.6a de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto. El responsable
confirmó seis decisiones antes del diseño: `page` se descarta al quitar un filtro, el radio es un solo chip, «Quitar
todos» conserva `view`, `sort` y `dir`, el texto del recuento, la barra también en la rama de parámetros inválidos y el
`size:exception`.
**Resultado:** con retoques (el prompt pedía conservar `page`, se descartó; la alerta de un `enum` inválido no nombraba el
parámetro y se corrigió; el chip hacía desbordar el documento a 320 px por el texto `sr-only`, detectado solo por el e2e)
**Prompt:**

> `/gentle-sdd-new` Paso D.6a de docs/DESIGN-ROADMAP.md. Usa `impeccable layout`, `impeccable clarify` y `impeccable
> extract` cuando un campo se use por segunda vez.
>
> - Filtros estructurados en la página principal, que hoy solo los ofrece tras interpretar una frase. Un formulario GET
>   con form=criteria (decisión 123) que produce exactamente los parámetros que valida searchQuerySchema
>   (packages/core/src/schemas/search-query.schema.ts).
> - En escritorio, barra horizontal sobre los resultados, con los filtros esenciales primero y etiquetas sin jerga
>   (search-labels.ts).
> - Resumen de filtros aplicados con sus valores reales. Cada uno es un enlace que quita solo ese parámetro y conserva los
>   demás (view, polygon, page…), más «Quitar todos». En móvil, una fila con desplazamiento horizontal.
> - Recuento de resultados visible. Solo el que la consulta ya devuelve: no se añade una consulta de total en un paso de
>   diseño.
> - Comparte campos con CriteriaForm (rama ?q=) en vez de duplicarlos. Sin JavaScript.

**Observación:** el prompt no decía qué hacer con `page` ni con el filtro geográfico de tres claves, ni cómo pintar la
barra con parámetros inválidos; las tres respuestas están en la decisión 151. El marcado compartido se comprobó con una
prueba de aprobación (el panel de `?q=` queda idéntico byte a byte) y la captura `nl-query` no cambia.

### 2026-10-05 — Estructura común: cabecera, pie, metadatos e iconos (paso D.5, decisiones 147-150)

**Tipo de tarea:** implementación (layout, cabecera, metadatos, iconos y matcher del proxy) con tests unitarios y e2e
**Forma de especificación:** SDD en modo automático (propuesta, especificación, diseño y tareas, en cinco unidades de
trabajo); el prompt del paso D.5 de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. TDD estricto. El responsable
eligió el icono de tejado dentro de un marco y la especificación se enmendó una vez (título de la ficha recortado, con
respaldo «Ficha de la vivienda»).
**Resultado:** con retoques (el `<main>` pasó del prompt «por página» al layout, las reglas axe de regiones se cubren
con `landmarks.spec.ts` y no con `AXE_TAGS`, y el PR superó el presupuesto de líneas)
**Prompt:**

> `/gentle-sdd-new` Paso D.5 de docs/DESIGN-ROADMAP.md. Usa `impeccable layout` y `impeccable clarify`.
>
> - Cabecera con la marca de D.0, acceso a la búsqueda y el selector de D.4.
> - Enlace «Saltar al contenido» como primer elemento enfocable, hacia <main id="contenido">. Un solo <main> por
>   página y regiones bien etiquetadas.
> - El pie conserva literal la atribución CC-BY del IGN/CNIG (R7). La de OpenStreetMap sigue en el mapa.
> - Metadatos: title.template en el layout y título propio en la ficha con generateMetadata, sin repetir la consulta
>   (React cache). Iconos con las convenciones de app/ (icon.svg, apple-icon.png). El matcher de src/proxy.ts solo
>   excluye favicon.ico: decide si los iconos nuevos quedan fuera del límite de peticiones.
> - Quita de page.tsx la línea de desarrollo «Esqueleto del monorepo · v{WEB_VERSION}» y apps/web/src/version.ts si
>   queda sin uso.
> - Anchos de contenedor y márgenes con los tokens de D.3, a 320, 768 y 1280 px.

**Observación:** el prompt dejaba abierta la decisión sobre el matcher y la forma de las URL de los iconos; la
respuesta (exclusión anclada por nombre exacto) y la forma real observada con Turbopack están en la decisión 149. El
único fallo del código generado fue una barra invertida simple en el matcher (ver `docs/AI-NOTES.md`).

### 2026-10-05 — Selector de tema con cookie y Route Handler (paso D.4, decisiones 144-146)

**Tipo de tarea:** implementación (script en línea, Route Handler, selector y CSS) con tests unitarios y e2e
**Forma de especificación:** SDD (exploración, propuesta, especificación, diseño y tareas, en cuatro unidades de
trabajo); el paso D.4 de `docs/DESIGN-ROADMAP.md` más restricciones explícitas (sin componentes de cliente nuevos,
`no-redirect.test.ts`, ruta de vuelta del mismo origen) y la exigencia de comparar tres formas de leer la cookie. TDD
estricto. El responsable fijó la opción (a), la ruta de vuelta, el estado solo visual y descartó `sdd-research`.
**Resultado:** con retoques (dos defectos solo detectados por el e2e y un refactor de ubicación de un comentario)
**Prompt:**

> Paso D.4 de docs/DESIGN-ROADMAP.md. Añade un selector de tema (claro, oscuro, sistema) sin componentes de cliente
> nuevos. Un script en línea en el `<head>` lee la cookie; el selector es un `<form method="post">` a
> `apps/web/src/app/theme/route.ts`, que valida con Zod y responde 303 con una Response construida a mano. Decide y
> registra cómo se lee la cookie, comparando (a) solo en el script, (b) en el layout con límites de carga por
> segmento y (c) en cada página, e indica qué pasa sin JavaScript en cada caso.

**Observación:** la comparación a/b/c pedida en el prompt llevó a una decisión argumentada (144). Los fallos del
código generado (importación con extensión `.js`, comparación del `Referer` con el origen equivocado, comentario
separado de su función) están en `docs/AI-NOTES.md`; los dos primeros solo los expuso `next build` y el e2e.

### 2026-10-05 — Tokens, tipografía y tema oscuro del sistema (paso D.3, decisiones 141-143)

**Tipo de tarea:** configuración (tokens de diseño en CSS) con un test de verificación de contraste
**Forma de especificación:** SDD en modo automático (propuesta, especificación, diseño y tareas antes de aplicar,
con una ronda correctiva del diseño tras la puerta de fase); el prompt del paso D.3 de `docs/DESIGN-ROADMAP.md`
pegado en `/gentle-sdd-new`. Aplicación con TDD estricto: el test (helpers de color y contraste, y comprobaciones
del CSS) se escribió y se vio fallar antes de tocar `globals.css`.
**Resultado:** con retoques (el prompt pedía una fuente autoalojada con `next/font` y `@theme inline`, ya superado por
la decisión 132; los nombres de los tokens y la ubicación de la fuente cambiaron respecto al texto, ver decisión 141)
**Prompt:**

> `/gentle-sdd-new` Paso D.3 de docs/DESIGN-ROADMAP.md. Carga impeccable (con su craft floor antes de editar
> UI) y usa `impeccable typeset` y `impeccable colorize` según el contrato de D.0.
>
> - Tokens en apps/web/src/app/globals.css con el patrón validado en D.2: color (superficie,
>   texto, texto secundario, borde, acento, peligro, éxito, foco), escala tipográfica,
>   espaciado (base 0.25rem de Tailwind), radios, sombras y capas (el mapa necesita
>   z-index propios). Los tokens de movimiento se dejan para D.16.
> - Tema oscuro solo según el sistema (el selector llega en D.4), con color-scheme en
>   :root.
> - Fuente según D.0, autoalojada con next/font y expuesta con @theme inline. Ningún host
>   de fuentes remoto; la CSP no cambia.
> - Anillo :focus-visible global que el contenido fijo no tape.
> - Estilos base mínimos. No rediseñes componentes: eso llega en los pasos siguientes.
>
> Documenta en las notas la tabla de contraste de cada par texto/fondo en ambos temas.

**Observación:** el prompt se quedó atrás de la decisión 132 (sin fuente propia), de modo que el texto se reescribió
en `docs/DESIGN-ROADMAP.md` y la fuente es una pila del sistema en `@theme static`. La puerta de fase cazó tres
salidas intermedias del diseño: una tolerancia de gamut de 1e-4 que rechazaba el propio vector de sanidad, razones de
contraste calculadas a mano que no coincidían con el validador (acento sobre blanco 6,05 frente a 6,44) y nombres de
token que divergían en silencio de la especificación (ver `docs/AI-NOTES.md`). Con el diseño corregido, ningún par de
contraste falló al aplicar y la línea base de axe solo perdió entradas. El volumen superó el presupuesto de 800
líneas (documentación obligatoria y snapshot incluidos) y se aceptó `size:exception`.

### 2026-10-05 — Experimentos de tema oscuro: tokens semánticos y teselas (paso D.2, decisiones 139-140)

**Tipo de tarea:** experimento descartable (código revertido; solo quedan evidencia y decisiones)
**Forma de especificación:** SDD en modo automático (propuesta, especificación, diseño y tareas antes de
aplicar); el prompt del paso D.2 de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. Sin TDD: el código
era desechable y el paso declara «Tests: ninguno».
**Resultado:** utilizable sin cambios (tokens validados; teselas rechazadas por coste, un resultado negativo
válido que activa la alternativa prevista)
**Prompt:**

> `/gentle-sdd-new` Paso D.2 de docs/DESIGN-ROADMAP.md. Dos experimentos acotados cuyo código NO se queda:
> se revierte antes de cerrar el paso. Sigue en la rama actual.
>
> 1. Tokens semánticos. En apps/web/src/app/globals.css, variables en :root y en .dark, expuestas con
>    @theme inline y @custom-variant dark. Comprueba que una utilidad como bg-surface cambia en tiempo de
>    ejecución al alternar la clase y al emular prefers-color-scheme, sin recompilar. Compáralo con light-dark().
> 2. Teselas oscuras. Filtro CSS aplicado solo al panel de teselas de Leaflet, nunca a marcadores, controles
>    ni atribución. Mide la legibilidad y el coste con la CPU ralentizada 4x.
>
> Evidencia: capturas a 320 y 1280 px en claro y oscuro. Registra en docs/DECISIONS.md el resultado de cada
> experimento y su alternativa si falla.

**Observación:** el diseño acertó casi todo y el spec funcionó a la primera en Docker. Dos puntos: la tercera
muestra de la sonda del diseño (`bg-spike-ink dark:bg-spike-surface`) no distinguía la variante `dark:`
(ambas ramas dan el mismo color) y se cambió a `bg-white dark:bg-black` antes de ejecutar (ver
`docs/AI-NOTES.md`); la tesela de relleno no sirve para juzgar legibilidad, así que hizo falta descargar
24 teselas reales y servirlas solo por el guard de red. El resultado de coste (razón 1,57) fue claramente negativo.

### 2026-10-01 — Verificación visual y de accesibilidad: herramienta, siembra, specs y capturas (pasos D.1a y D.1b, decisiones 135-138)

**Tipo de tarea:** configuración (herramienta de test, siembra de base de datos, Docker)
**Forma de especificación:** SDD en modo automático, con especificación, diseño y tareas escritos antes de
aplicar; el prompt del paso D.1 de `docs/DESIGN-ROADMAP.md` pegado en `/gentle-sdd-new`. La aplicación
se hizo con TDD estricto y el paso se partió en D.1a/D.1b antes de aplicar.
**Resultado:** pendiente de revisión (D.1a y D.1b aplicadas)
**Prompt:**

> `/gentle-sdd-new` Paso D.1 de docs/DESIGN-ROADMAP.md. Añade la verificación visual y de
> accesibilidad de apps/web. No cambies estilos ni componentes.
>
> - Dependencias de desarrollo en apps/web con versión exacta: @playwright/test y
>   @axe-core/playwright. [...] Scripts test:e2e y test:e2e:update.
> - Matriz de proyectos: 320, 768 y 1280 px de ancho, cada uno en tema claro y oscuro.
> - Rutas: /, /?view=map, /?q=<frase de ejemplo>, una ficha /properties/<id> y una 404.
> - Base de datos dedicada (nombre terminado en _e2e) con un guardián que se niegue a sembrar
>   cualquier otra, como el de las bases _bench (decisión 046). Siembra determinista. [...]
> - La web arranca con el rol de solo lectura. Las teselas se sirven desde un PNG local y
>   cualquier otra petición a un host externo aborta y hace fallar el test.
> - toHaveScreenshot con animations: 'disabled'. Capturas de referencia solo en Docker. [...]
>
> Si la previsión supera 800 líneas, parte el paso en D.1a (herramienta y siembra) y D.1b
> (specs y capturas de referencia).

**Observación:** el diseño pedía revisar cuatro puntos al aplicar y los cuatro se resolvieron sin
cambiar de rumbo: `docker compose run --build` existe, `test.fail()` cubre el fallo del cierre de una
fixture automática, el mapa `exports` no rompe nada y la CSP `upgrade-insecure-requests` no se aplica
sobre `http://127.0.0.1`. La estimación de ~790 líneas se quedó corta: el dataset se separó en un fichero
puro con su test (no estaba en el diseño) y Prettier reparte las líneas largas; el responsable ya había
aceptado `size:exception`. El agente no puede leer el `.env`: las variables `E2E_*` se derivaron con un
script que no imprime los valores.
D.1b (specs, capturas y línea base axe) se aplicó en un segundo commit, también con TDD estricto para la lógica
pura de huellas (20 tests escritos antes). Las capturas y la línea base se generaron solo en Docker; dos
ejecuciones consecutivas dieron resultados idénticos y no hizo falta ninguna máscara. Utilizable sin cambios.

### 2026-10-01 — Contexto de producto y dirección visual (paso D.0, `PRODUCT.md`, decisiones 132-134)

**Tipo de tarea:** diseño (contexto de producto y dirección visual)
**Forma de especificación:** SDD en modo automático (exploración, propuesta, especificación, diseño,
tareas y aplicación), con `impeccable init` e `impeccable shape` y varias tandas de preguntas al
responsable.
**Resultado:** pendiente de revisión
**Prompt:**

> `/gentle-sdd-new` con el bloque `text` del paso D.0 de `docs/DESIGN-ROADMAP.md`, literal.
> Retomado después con `/gentle-sdd-continue design-direction-d0`. Texto del bloque:
>
> Paso D.0 de docs/DESIGN-ROADMAP.md. No toques código, estilos ni tests.
>
> Carga la skill impeccable. Ejecuta `impeccable init` para crear PRODUCT.md en la raíz
> del repositorio y después `impeccable shape` para fijar conmigo la dirección visual.
> Antes de decidir nada, pregúntame:
>
> 1. Nombre e identidad del producto (hoy «Agregador inmobiliario»), tono y productos
>    de referencia.
> 2. Tipografía: pila del sistema o fuente propia autoalojada (la CSP solo admite
>    font-src 'self').
> 3. Presentación de la ficha de la vivienda: jerarquía del precio, galería, anuncios de
>    origen, histórico de precios y ubicación aproximada. La investigación no encontró
>    evidencia primaria (hueco a), así que es una decisión de producto.
> 4. Disposición de la búsqueda: vista dividida lista + mapa en escritorio y lista primero
>    con conmutador en móvil, o la alternativa que prefiera.
> 5. Registro del texto (hoy tuteo) y etiquetas en español para los valores de enumerado
>    que hoy salen en crudo («flat», «rent»).
>
> Lee antes CLAUDE.md, docs/ARCHITECTURE.md, las reglas transversales R1-R12 de
> docs/DESIGN-ROADMAP.md y la web actual: apps/web/src/app/page.tsx,
> apps/web/src/app/properties/[listingId]/page.tsx y apps/web/src/components. Es una
> herramienta de búsqueda de uso frecuente con una ficha de lectura: la dirección debe ser
> sobria.
>
> Registra el contrato de dirección en docs/DECISIONS.md y anota en las notas de D.9 lo que
> afecte a la ficha.

**Observación:** el sorteo de impeccable (semilla `95c485be`, modo *operate*) asignó la tercera
dirección de la lista propia, «Hoja del Mapa Topográfico», y el responsable la eligió. Sin generación
de imágenes, la ruta es *code-led*. Se incorporan cinco mejoras de los aspirantes descartados. La
opción del mapa estático no avisaba del choque con R2 y R8, y hubo que volver a preguntar (ver
`AI-NOTES.md`). El responsable pidió parar tras la propuesta, y el cambio se retomó en otra orden.

### 2026-10-01 — Hoja de ruta del diseño UX/UI de la web (`docs/DESIGN-ROADMAP.md`)

**Tipo de tarea:** planificación (hoja de ruta de diseño)
**Forma de especificación:** SDD parcial: exploración, investigación en dos pasadas (evidencia
parcial aceptada por el responsable) y propuesta. Especificación, diseño y tareas se omitieron a
petición del responsable, y el documento se escribió directamente desde la propuesta.
**Resultado:** pendiente de revisión
**Prompt:**

> `/gentle-sdd-new` Muy bien ahora que hemos terminado con el roadmap queda una cosa muy importante
> por hacer ya que la web no está terminada ni muchísimo menos, ya que el diseño UX/UI actualmente
> es inexistente, por ello he instalado las siguientes skills:
> - https://github.com/emilkowalski/skills
> - https://github.com/pbakaus/impeccable
>
> Y he instalado el mcp de playwright para que puedas visualizar la web y probarla y comprobar como
> funciona todo, su diseño y demás.
> Ahora habría que hacer otro roadmap para el diseño de la web (entiendo que un roadmap es la mejor
> forma, no hacerlo todo del tirón), planificando y diseñando todo, ya que están las
> funcionalidades pero el diseño de la web ahora mismo es nulo.

**Observación:** se hicieron dos tandas de preguntas de producto. En la de dispositivos, el
responsable cambió su respuesta de «primero móvil» a «ambos por igual» (decisión 129). El resultado
son 18 pasos, D.0-D.17, con D.6 y D.8 partidos en a/b, y las decisiones 126-131. La investigación
tuvo que corregirse en su segunda pasada por una restricción de CSP inferida sin mirar la
configuración (ver `AI-NOTES.md`).

### 2026-10-01 — Instalación de la skill de diseño Impeccable en el proyecto

**Tipo de tarea:** configuración
**Forma de especificación:** referencia externa (URL del repositorio `pbakaus/impeccable`)
**Resultado:** utilizable con retoques
**Prompt:**

> instala la skill de este repositorio: https://github.com/pbakaus/impeccable
>
> lo vamos a usar en buscahogar por lo tanto instala eso también

**Observación:** el instalador recomendado (`npx impeccable install`) falló al descargar
(«invalid zip data»), así que se copió a mano la compilación para Claude Code del repositorio
(`.claude/skills/impeccable`, cuatro agentes y los hooks de `settings.json`). Primero se instaló
solo de forma global, y ahí los hooks no hacen nada porque buscan la skill dentro del proyecto;
por eso hizo falta el segundo prompt. `.claude/` está en `.gitignore`: la instalación no queda
versionada y cada clon tiene que repetirla.

### 2026-10-01 — Cierre de pendientes del 3.1 (scripts raíz y especificación obsoleta)

**Tipo de tarea:** configuración
**Forma de especificación:** iterativo (referencia a la lista de pendientes del cierre del 3.1)
**Resultado:** utilizable sin cambios
**Prompt:**

> soluciona lo que está pendiente y ya hago el push para pasar a la siguiente fase

**Observación:** el pendiente decía «la CI debe construir `dist/`», pero el repositorio no tiene
CI: el hueco real eran los scripts raíz `test`, `typecheck` y `lint`, que no compilaban los
paquetes (decisión 125). Era la tercera vez que aparecía (decisión 031, paso 1.12 en `AI-NOTES.md`
y el 3.1). Se comprobó borrando `packages/core/dist` y lanzando los tres scripts desde cero. Además
se corrigió en Engram (obs #174) el escenario de `web-search-listing` que seguía diciendo que no
hay ningún `'use client'`.

### 2026-10-01 — Búsqueda mediante lenguaje natural (3.1)

**Tipo de tarea:** dominio (intérprete en `core`) + interfaz (rama `?q=` en `apps/web`) + evaluación
**Forma de especificación:** SDD completo (explorar, proponer, especificación, diseño, tareas, aplicar) en cinco unidades más una de corrección (U2b)
**Resultado:** utilizable con retoques. La U2b corrigió tres fallos del intérprete que el conjunto de desarrollo del corpus destapó (artículo «la» como lugar, «Casa» leído como tipo dentro de un lugar, «página» absorbida en el lugar). Además, la decisión 122 estrechó un escenario de la especificación: un único lugar que solo coincide por prefijo se ofrece, no se selecciona solo.
**Prompt:**

> Implementa la interpretación de consultas en lenguaje natural: transformar una frase del usuario en los criterios estructurados del motor de búsqueda, validados con el mismo esquema Zod que los filtros.
>
> La consulta interpretada debe mostrarse al usuario de forma editable, para que pueda corregir la interpretación antes de buscar.

(Paso 3.1 de `docs/ROADMAP.md`, literal; invocado vía `/gentle-sdd-new`.)

**Observación:** el paso se resolvió sin LLM (decisión 120), así que el comportamiento se puede medir sobre un corpus etiquetado. Lo que más rindió fue separar el corpus en desarrollo y reserva (decisión 124): la cifra de desarrollo mejoró al ajustar el intérprete sobre él, y solo la de reserva es una estimación sin sesgo. Un error de unidades latente (precio en euros frente a céntimos en las URL) apareció al diseñar y se corrigió dentro del paso (U1). Detalle en `docs/ROADMAP.md`, paso 3.1.

### 2026-10-01 — Aceptación en el navegador y cierre del 2.6

**Tipo de tarea:** verificación manual + cierre del ciclo SDD (verificación y archivo)
**Forma de especificación:** dos órdenes breves del responsable sobre el procedimiento ya escrito
**Resultado:** utilizable sin cambios. La verificación da PASS con avisos (31 requisitos y 101
escenarios, sin críticos).
**Prompt:**

> arráncame el proyecto y lo pruebo en el navegador

> muy bien ya puedes cerrar el 2.6

**Observación:** la base de desarrollo estaba vacía. El responsable eligió probar con el corpus de
banco, y la web lo leyó con su rol de solo lectura, nunca con el de propietario. Esos permisos
temporales se retiraron al terminar. El registro nativo de intentos pidió un reset explícito, que
autorizó el responsable: el 30-09 se había reservado una verificación antes de tiempo y se cerró como
interrumpida.

### 2026-10-01 — Comprobaciones con Docker del 2.6 (suite de base de datos, banco y prueba de plan)

**Tipo de tarea:** verificación con base de datos real + medición de rendimiento
**Forma de especificación:** continuación del ciclo SDD del 2.6, con el procedimiento que dejaron
escrito las notas del paso
**Resultado:** utilizable con retoques — la suite de base de datos falló en su primera ejecución por
un defecto del propio test (siembras sobre un borde geodésico), corregido; G1 y G2 cumplen sin
necesidad de decisión del responsable.
**Prompt:**

> docker ya está arrancado, continúa por donde ibas

**Observación:** se creó `buscahogar_test` y se migró `buscahogar_test_bench` a la 0016. Las URLs se
derivaron del `.env` sin imprimirlas, y `jit = off` se aplicó solo durante la medición. El único
hallazgo fue del test, no del código: un test de base de datos escrito sin poder ejecutarlo
contradecía la especificación (`AI-NOTES.md`).

### 2026-09-30 — Vista de mapa y búsqueda por zona dibujada (2.6), ciclo SDD completo en cinco commits

**Tipo de tarea:** interfaz (mapa de cliente) + dominio (validación geométrica) + consulta SQL
(filtro espacial) + configuración (CSP, dependencias) + escenarios de banco
**Forma de especificación:** ciclo SDD — explore → propuesta con decisiones P1-P8 del responsable →
`sdd-spec` y `sdd-design` en paralelo (tres revisiones del diseño, con dos rechazos de la puerta) →
`sdd-tasks` → `sdd-apply` en cinco unidades (core, db, banco, web pura, web con interfaz) más
documentación, cada una validada antes de su commit
**Resultado:** utilizable con retoques — el validador exigió correcciones en cada paso, y el
orquestador hizo una corrección en `db` (el total exacto se devolvía sin acotar). La medición de
banco y la aceptación en el navegador quedan pendientes del responsable.
**Prompt:**

> Añade la vista de mapa con las viviendas resultantes de la búsqueda y búsqueda por zona dibujada
> sobre el mapa.

Invocado vía `/gentle-sdd-new`.

**Observación:** el prompt une dos funciones con muy distinto riesgo. El mapa es sobre todo interfaz;
la zona dibujada es entrada externa no confiable y cambia el modelo de coste de la búsqueda (un
polígono no tiene municipio, así que no hay cobertura ni señal de demanda posibles). Casi todo lo
valioso salió de las preguntas previas: si cerrar el anillo o rechazarlo, qué cuenta en el total del
mapa, y si usar un plugin de dibujo (el responsable lo sustituyó por un control propio). Los fallos
del proceso están en `docs/AI-NOTES.md`; las decisiones, en la 112-119.

### 2026-09-30 — Cierre de los pendientes del responsable tras el 2.5

**Tipo de tarea:** documentación de reglas + medición de rendimiento + operación de bases de datos
**Forma de especificación:** petición conversacional. El asistente explicó los cuatro pendientes y el
responsable decidió cada uno con un cuestionario: editar `CLAUDE.md`, fracción de refresco 0,3,
migrar y medir el banco, y hacer push al final.
**Resultado:** utilizable con retoques. La primera repetición de la matriz se hizo sin
`jit = off` y dio un falso incumplimiento en `geo-25km-price` (555 ms). Se repitió con el
procedimiento documentado del 2.4 y las 12 combinaciones cumplen.
**Prompt:**

> lo que sigue pendiente de mi vamos a abordarlo, explícame que pasa

**Observación:** el corpus de banco se había perdido (0 filas) sin que nada lo avisara; la semilla
fija permitió regenerarlo idéntico. La diferencia entre la medición falsa y la buena no estaba en el
plan, sino en el ajuste de sesión: comparar el campo `jitMs` del plan lo aclaró sin adivinar.

### 2026-09-30 — Sonda de `adIds` ejecutada por el asistente (cierre del 2.5)

**Tipo de tarea:** operación contra la API real (cuota facturable) + evidencia de comportamiento
**Forma de especificación:** petición conversacional sin especificación previa. El asistente propuso
cómo conseguir los dos códigos que faltaban y el coste, y el responsable lo autorizó (4-5 búsquedas).
**Resultado:** utilizable sin cambios. Una búsqueda completa de un círculo de 170 m dio 42 anuncios.
Cruzada con la fixture del 10 de septiembre, identificó `111037729` como dado de baja; como vivo se
usó `111715742`. La sonda devolvió `omitted`, y `DELISTED_OMISSION_CONFIRMED` pasó a `true` con TDD:
el test de atadura a la fixture falló primero. Coste: 4 búsquedas y 2 tokens.
**Prompt:**

> porque no haces tú la sonda contra idealista? / tú no puedes obtener los códigos que necesitas?
> porque yo no lo se tampoco

**Observación:** el bloqueo aparente era que «solo el responsable sabe qué anuncio está dado de
baja». En realidad bastaba un mecanismo independiente del que se prueba: un barrido completo, sin
paginación truncada, en lugar del filtro `adIds`. Así se evita el razonamiento circular sin
inspeccionar el portal a mano. Las instrucciones de operador del agente de S3 traían un error de
uso (`pnpm probe:adids -- …`: pnpm pasa el `--` literal y el script lo rechaza). Se detectó en el
ensayo sin red, antes de gastar cuota.

### 2026-09-29/30 — Refresco y retención (2.5), ciclo SDD completo en cuatro unidades de trabajo

**Tipo de tarea:** dominio (política pura) + planificación de ingesta + esquema y migraciones + consulta
SQL + privacidad de datos (redacción)
**Forma de especificación:** ciclo SDD — explore → research → propuesta (decisiones D1-D10 del
mantenedor) → `sdd-spec` y `sdd-design` (dos revisiones, la segunda con las decisiones U1-U3) → `sdd-tasks` →
`sdd-apply` en cuatro unidades (S1-S4), cada una validada y commiteada antes de la siguiente
**Resultado:** utilizable con retoques — tres correcciones. (1) S1, tras validación:
`scheduleRefresh` dejaba un cursor obsoleto. (2) S3, tras validación: una carrera entre la verificación y un barrido
podía retirar un anuncio recién visto, y una respuesta vacía a un lote de varios ids se habría
tratado como «todos dados de baja». (3) En el diseño: se proponía borrar filas de `zones`, que es el
catálogo INE sembrado: se cambió a un reinicio. Además, la previsión de tamaño se quedó unas tres
veces corta y el paso se entrega con la retirada de anuncios inactiva hasta que el responsable
ejecute la sonda.
**Prompt:**

> Implementa la política de refresco y retención de docs/ARCHITECTURE.md:
> refresco semanal para zonas con consultas recientes y menor para las inactivas,
> marcado de anuncios desaparecidos como inactivos, y purga separada de anuncios
> inactivos y de zonas sin consultas.

**Observación:** el prompt nombra cuatro comportamientos y deja sin decidir casi todo lo que los hace
seguros: qué cuenta como «consulta reciente» (hubo que crear una señal de demanda y un nuevo
privilegio), cómo se sabe que un anuncio «desapareció» sin gastar la cuota (la ausencia en un
barrido no basta: decisión 105), y qué significa «purgar» algo que la regla de `CLAUDE.md` dice que
no se sobrescribe (tombstone como redacción, decisión 107). Esas preguntas se resolvieron con el
mantenedor antes de la propuesta y otra vez tras el diseño. Lo más valioso lo encontró el
validador, no la planificación: las dos correcciones de S3 eran falsos positivos de retirada, el
fallo que más caro sale en un agregador. Los fallos del proceso están en `docs/AI-NOTES.md`.

### 2026-09-29 — Indexación y medición de rendimiento (2.4), ciclo SDD completo en dos sesiones

**Tipo de tarea:** consulta SQL (planes de ejecución e índices) + herramienta de medición + datos
sintéticos
**Forma de especificación:** ciclo SDD — explore → preproposal con siete decisiones del mantenedor
(volumen, base separada, alcance, metodología, registro, ubicación, generación) → propuesta →
`sdd-spec`/`sdd-design` en paralelo (una corrección del diseño tras validación) → `sdd-tasks` →
`sdd-apply` en dos lotes → procedimiento de banco y commit C hechos por el orquestador
**Resultado:** utilizable con retoques — los dos lotes de `sdd-apply` suspendieron la validación de
contexto limpio y necesitaron una corrección cada uno; el objetivo final se alcanzó con un cambio
que el prompt no pedía (JIT desactivado para el rol de la búsqueda)
**Prompt:**

> Genera un volumen de datos suficiente para que la indexación importe y mide el
> rendimiento de las consultas de búsqueda:
>
> - Analiza los planes de ejecución de las consultas principales.
> - Propón los índices necesarios y aplícalos.
> - Vuelve a medir y dame los tiempos antes y después.
>
> Objetivo: búsqueda sobre datos indexados por debajo de 500 ms.

**Observación:** el prompt deja abierto casi todo lo que decide si la medición vale como evidencia:
cuánto volumen, dónde viven los datos sintéticos, qué cuenta como "consulta principal" y cómo se
mide (una ejecución o percentiles, frío o caliente). Esas siete decisiones se resolvieron con el
mantenedor antes de la propuesta. Lo más valioso salió de medir, no de planificar: con los índices,
11 de 12 combinaciones cumplían, pero `geo-25km-price` empeoraba a 651 ms por la compilación JIT,
algo que ningún artefacto previo había previsto. La frase "propón los índices necesarios" invitaba a
un índice por filtro; medido, `(rooms)` y `(bathrooms)` empeoraban la consulta, y los índices útiles
fueron los de orden. Los fallos del proceso (API de PostgreSQL 18 usada en 17, un informe antes/
después sin CLI que lo produjera, un subagente que truncó la base de desarrollo) están en
`docs/AI-NOTES.md`.

### 2026-09-25/28 — Comparación de imágenes (2.3), ciclo SDD completo con research y dos rondas de decisiones del mantenedor

**Tipo de tarea:** dominio puro (comparador/decorador de señal, sin I/O) + pipeline de ingesta con
dependencia nativa (`sharp`) + fixtures reales con procedencia + calibración de umbral + ablación
en la CLI ya existente de 2.2
**Forma de especificación:** ciclo SDD completo — explore → research (web, admisión concedida) →
preproposal en dos rondas de decisiones confirmadas por el mantenedor (D1-D8) → `sdd-spec`/
`sdd-design` en paralelo (con una ronda correctiva tras un validador en rojo) → `sdd-tasks` →
`sdd-apply` en varios lotes (núcleo puro y pipeline de ingesta → puerta de fotos del mantenedor →
fixtures/calibración → ablación en el CLI → este registro documental)
**Resultado:** utilizable con retoques — spec y diseño necesitaron una ronda correctiva antes de
aplicar (columnas CSV y vocabulario de nivel/razón desalineados entre ambos artefactos escritos en
paralelo); durante la aplicación, un hallazgo empírico corrigió una afirmación errónea del diseño
sobre `sharp` (ver `docs/AI-NOTES.md`)
**Prompt:**

> Añade la comparación de imágenes como señal adicional mediante perceptual hashing,
> teniendo en cuenta que cada portal reescala y recomprime, por lo que la comparación
> exacta no sirve.
>
> Mide su aportación real frente a la deduplicación basada solo en datos
> estructurados, sobre el mismo conjunto etiquetado.

**Observación:** el prompt fija el QUÉ (perceptual hashing, medir aportación real, mismo conjunto
etiquetado) pero deja abiertas decisiones de producto que el preproposal tuvo que escalar en dos
rondas: de dónde salen las imágenes (D2/D5: fotografías CC0 reales con transformaciones
controladas, nunca miniaturas de portal), si la señal solo suma o también resta (D3: solo-positivo,
nunca negativo), alcance de producción (D7: evaluación-only, aplazado) y cómo calibrar el umbral
sin contaminar el corpus de evaluación (D8: conjunto separado, regla fija antes de medir). El
resultado real de la ablación (ejecución real de la CLI sobre el corpus de 24 pares, a los umbrales
por defecto de cada estrategia) es que la señal de imagen **no cambia ninguna banda** —
`bandChanges` vacío para ambas estrategias, matrices de confusión idénticas con y sin imagen— pero
sí mejora precisión/recall/F1 de forma visible en la rejilla de sweep a umbrales más bajos (por
ejemplo rule-based con `high=0.75`: F1 0,8421 → 0,9000). El caso difícil diseñado a propósito
(`hn-1`/`hn-7`, misma fachada, distinto anuncio) midió distancia real 14, justo por encima del
umbral calibrado `T=10`: un casi-empate real entre el margen de recorte del pipeline (5%) y la
franja de chrome de portal simulada (8%), no ajustado para forzar ningún resultado. El coste
principal del proceso fue de tamaño, no de especificación: `sdd-tasks` pronosticó ~2100 líneas
autoradas frente al presupuesto de sesión, y la tarea de fotos (3.1) es una precondición exclusiva
del mantenedor —aportar o autorizar la descarga de 18 fotografías CC0— que partió la aplicación en
varios lotes con una puerta de revisión intermedia.

### 2026-09-25 — Comparación de estrategias de deduplicación (2.2), ciclo SDD completo en dos lotes de aplicación

**Tipo de tarea:** dominio (segunda `DedupStrategy`) + métricas de evaluación + CLI de exportación
**Forma de especificación:** ciclo SDD completo — explore → research (web, admisión concedida) →
propose → `sdd-spec` y `sdd-design` (con una ronda correctiva tras FAIL del validador) →
`sdd-tasks` → `sdd-apply` en dos lotes (fases 1-3, commits 1-3; fases 4-7, commits 4-6)
**Resultado:** utilizable con retoques — spec y diseño corregidos tras un FAIL del validador; las
cuatro etiquetas de verdad terreno que faltaban (md-2, md-4, hn-7, hn-8) las aportó el responsable
del proyecto por cuestionario; una tarea con especificadores de import relativos bloqueó al
dispatcher nativo (`blocked(edit_authority_missing)`) y se reescribió con rutas relativas al
repositorio
**Prompt:**

> Implementa una segunda DedupStrategy con un enfoque distinto a la basada en
> reglas, y un comando que ejecute varias estrategias sobre el mismo conjunto
> etiquetado y reporte precisión, recall y F1 de cada una, además del efecto de
> mover los umbrales.
>
> La salida debe ser exportable para incluirla en la memoria.

**Observación:** el prompt no fija QUÉ segunda estrategia usar ni cómo evaluar "verdad terreno"
frente a la banda ya diseñada de rule-based — ambos huecos los resolvió el ciclo de
especificación, no la implementación. El hallazgo más caro fue que la especificación inicial
media precisión/recall/F1 contra `expected` (la banda DISEÑADA de rule-based), lo que habría hecho
la comparación circular: por construcción, `expected` es la salida de UNA de las dos estrategias
comparadas. Se corrigió separando un campo `truth` de verdad terreno independiente. El diseño
inicial también citaba un "corte del 2%" y una "decisión 023" inexistentes para justificar los
umbrales de nivel de la nueva estrategia; la revisión los sustituyó por los puntos de decaimiento
reales de `rule-based/signals.ts` (10% relativo, 100 m) y marcó los cortes "near" (2%, 20 m) como
elecciones a priori nuevas, sin precedente. El diseño ilustraba además el argumento de "dos campos
no bastan" con un cálculo a mano que omitía `price` — inalcanzable en la práctica porque
`priceCents` es obligatorio (decisión 087, detalle en `AI-NOTES.md`); `sdd-apply` no ajustó los
parámetros para forzar esa cifra, sino que probó el mismo principio con valores reales. Resultado
real de la comparación (corpus de 24 pares, `pnpm --filter @buscahogar/ingestion
compare-strategies`, ejecución real sobre el corpus a fecha de esta entrada): a los umbrales por
defecto de cada estrategia, rule-based obtiene precisión 0.8889/recall 0.8000/F1 0.8421, y la
estrategia probabilística obtiene precisión 0.8000/recall 0.4000/F1 0.5333 — la exigencia
implícita de FS de al menos tres campos fuertes de acuerdo (decisión 087) deja 6 de los 10
duplicados reales como `undecided`, frente a 2 de rule-based. Aplicado en dos lotes por el
pronóstico de carga de revisión (`400-line budget risk: High`, ~1900-2100 líneas estimadas): el
responsable del proyecto aceptó `size:exception` en una sola PR con 6 commits de trabajo sobre
`feature-fase2`, sin ramas nuevas. Dos correcciones propias detectadas y resueltas dentro de la
propia aplicación, sin intervención externa: un commit con pathspec parcial tras `git mv` que dejó
una copia obsoleta en el primer lote, y una aserción de test que se autoinvalidó por contener la
subcadena "null" en su propio dato de prueba en el segundo lote — ambas en `AI-NOTES.md`.

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

---

### 2026-10-20 — Búsqueda vacía en una zona cubierta y suites que vacían la base de desarrollo (3.2)

**Tipo de tarea:** corrección de un fallo (búsqueda vacía) + aislamiento de las bases de datos de test + aviso de interfaz
**Forma de especificación:** ciclo SDD completo (`fix-search-empty-results`) — explore → research → propose → spec y diseño → tasks → apply en
tres commits, con operativa de datos hecha por el orquestador
**Resultado:** utilizable con retoques — el texto del aviso se refinó en `impeccable clarify` (nexo causal, sin repetir «Los filtros aplicados»)
y el aprovisionamiento de las bases de test se rediseñó (de `initdb.d` y `\gexec` a un `globalSetup` autoaprovisionado; spec revisión 2).

**Prompt:** la búsqueda `?operation=rent&propertyType=flat&maxPrice=600&minRooms=3&zone=18009` devuelve una lista vacía; el mensaje original
del responsable pedía averiguar por qué y arreglarlo.

**Observación.** El código de búsqueda era correcto. La zona 18009 solo existía como fila de prueba de
`apps/web/test/db/coverage-registration.test.ts` porque las suites habían vaciado la base de desarrollo (decisión 046). Se cerró la causa
(decisión 245), se añadió el aviso de zona cubierta (decisión 246) y se recargaron datos reales de Granada. Los filtros exactos del
responsable siguen vacíos con datos reales (0 pisos ≤600 € con ≥3 habitaciones). Detalle en `docs/ROADMAP.md`, paso 3.2.

---

### 2026-10-20 — Seguimiento de los pendientes de 3.2

**Tipo de tarea:** operativa y documentación
**Forma de especificación:** instrucción directa, sin SDD
**Resultado:** utilizable sin cambios para lo que estaba al alcance de los agentes; `.env` y `.env.example` siguen fuera de su alcance

**Prompt:** «ya hice el cambio en el env, los demás cambios que haga falta hacer hazlos tú y continúa si no hay ningún problema, pero no
empieces el 3.3»

**Observación.** Con `BENCH_DATABASE_URL` repuntada, `test:db` de ingestion pasa entero. Se borró la base vacía `buscahogar_test`. Al
comprobar OPS-0 apareció que en `.env` faltan `OPERATION`, `DAILY_SEARCH_CAP` y `BLOCKING_*`, así que el worker de cobertura no arranca.
Se documentó en el README y en el ROADMAP 3.2. El responsable las añadió después («ya hice el cambio en el env,
continúa»): se validaron por presencia y formato sin imprimir valores, y `readEnv` del worker acepta la configuración. No se arrancó el bucle
real, para no gastar cuota en refrescos o verificaciones.

---

### 2026-10-20 — Desbordamiento de parámetros al consolidar tras el barrido de Granada

**Tipo de tarea:** corrección de un fallo
**Forma de especificación:** instrucción directa, sin SDD, con TDD estricto (test que reproduce el 08P01 antes del arreglo)
**Resultado:** utilizable con retoques — el test de atomicidad esperaba el nombre de la restricción en el mensaje y Drizzle lo envuelve en `cause`

**Prompt:** el responsable eligió «Sí, ahora» a la pregunta de corregir el desbordamiento de la consolidación antes de cerrar el 3.2.

**Observación.** El worker completó Granada (36 peticiones, 1 751 anuncios, zona cubierta) y cayó en `writeConsolidation`: un INSERT de
~99 880 parámetros frente al tope de 65 535 del protocolo. Se corrigió con lotes dentro de la misma transacción (decisión 247), extendidos a
`property_listings` y a los `inArray` del corpus completo en la hidratación. El reprocesado sobre la base de desarrollo queda para el
responsable.
