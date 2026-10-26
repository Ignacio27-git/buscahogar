// D.14 (decisión 186) — CSS autónomo para las páginas que NO cuelgan del layout raíz ni de
// `globals.css`: `global-error.tsx` (sustituye al layout cuando este falla) y la página 429 que
// construye el proxy como cadena. Importar `globals.css` arrastraría todo Tailwind y fallaría
// justo cuando falla su fichero; por eso se copian aquí los pocos tokens que hacen falta.
//
// Los valores son un ESPEJO de `:root` y `.dark` de `globals.css`; `test/standalone-page.test.ts`
// comprueba la paridad y el contraste AA en ambos esquemas. Sin `url(`, sin recursos externos y
// sin movimiento. Se elige el esquema con `prefers-color-scheme`, porque aquí no hay script de tema.
// D.18 (decisión 219): la franja `.standalone-header` espeja la cabecera de la app (borde inferior
// `--rule`, marca con `--text-heading-3*` y 40 px de alto) y queda fuera del bloque centrado.
// D.19 (decisiones 232 y 233): paleta y radio de la paleta cálida; la familia tipográfica sigue siendo la pila del
// sistema (excepción documentada: sin Figtree ni fuente autoalojada, porque esta página debe funcionar cuando el layout falla).
// D.22 (decisión 266): la franja lleva la marca «casa encontrada» (`lib/brand-mark.ts`) delante del nombre.
// D.22 (decisión 269): suma la ilustración del estado, la acción principal y `--ink-on-accent`.
// Módulo puro y sin `server-only`: el proxy lo alcanza fuera del grafo de componentes de servidor.
export const STANDALONE_PAGE_CSS = `:root {
  color-scheme: light dark;
  --surface: #faf8f3;
  --surface-raised: #fefdfb;
  --surface-sunken: oklch(95% 0.008 85);
  --ink: #1e1c19;
  --ink-muted: oklch(49% 0.014 70);
  --rule: #e4e2dc;
  --rule-control: oklch(60% 0.012 70);
  --accent: #1f5fa8;
  --ink-on-accent: #ffffff;
  --focus: #1f5fa8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: oklch(20.5% 0.006 70);
    --surface-raised: oklch(24.5% 0.007 70);
    --surface-sunken: oklch(16.5% 0.005 70);
    --ink: oklch(92% 0.012 85);
    --ink-muted: oklch(71% 0.014 75);
    --rule: oklch(32% 0.008 70);
    --rule-control: oklch(57% 0.012 70);
    --accent: oklch(72% 0.12 252);
    --ink-on-accent: oklch(20.5% 0.006 70);
    --focus: oklch(72% 0.12 252);
  }
}
*, ::before, ::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--surface);
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.5rem;
}
.standalone-header { border-bottom: 1px solid var(--rule); padding: 0.5rem 1.5rem; }
.standalone-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  font-size: 1.125rem;
  line-height: 1.5rem;
  font-weight: 600;
  color: var(--ink);
  text-decoration-line: none;
}
/* D.22 (decisión 266): la marca espeja .brand-mark y .brand-mark__house de globals.css. La tinta de la lupa es
   currentColor (el color del enlace) y la casa toma el acento del esquema. */
.brand-mark { inline-size: 1.75rem; block-size: 1.75rem; flex: none; }
.brand-mark__house { fill: var(--accent); }
/* D.22 (decisión 269): la ilustración del estado y la acción principal espejan .state-illustration* y
   .state-action de globals.css. Contornos con --rule-control, figura en tinta atenuada y casa con el acento. */
.state-illustration { display: block; inline-size: 6rem; block-size: 4rem; margin: 0 0 1rem; color: var(--ink-muted); }
.state-illustration__ring { stroke: var(--rule-control); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.state-illustration__figure { stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.state-illustration__house { fill: var(--accent); }
/* 34rem de texto + 2 x 1.5rem de relleno: border-box, así que el ancho útil no cambia. */
.standalone { max-width: 37rem; margin: auto; padding: 1.5rem; }
.standalone h1 {
  margin: 0 0 0.75rem;
  font-size: 1.75rem;
  line-height: 2.25rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.standalone p { margin: 0 0 1.25rem; color: var(--ink-muted); }
.standalone__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.standalone a { color: var(--accent); text-decoration-line: underline; text-underline-offset: 0.2em; }
.standalone button {
  padding: 0.5rem 0.75rem;
  background-color: var(--surface-raised);
  color: var(--ink);
  border: 1px solid var(--rule-control);
  border-radius: 0.375rem;
  font: inherit;
  cursor: pointer;
}
.standalone button:active { background-color: var(--surface-sunken); border-color: var(--ink); }
/* Acción principal: relleno de acento y texto --ink-on-accent, para el botón y para el enlace. Va después de
   las reglas de .standalone a y .standalone button y las gana por especificidad. */
.standalone .state-action {
  display: inline-flex;
  align-items: center;
  min-block-size: 2.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--accent);
  color: var(--ink-on-accent);
  border: 1px solid var(--accent);
  border-radius: 0.375rem;
  font: inherit;
  font-weight: 600;
  text-decoration-line: none;
  cursor: pointer;
}
.standalone .state-action:active {
  background-color: color-mix(in oklab, var(--accent), var(--ink) 20%);
  border-color: color-mix(in oklab, var(--accent), var(--ink) 20%);
}
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* El título que recibe el foco por programa (frontera de error) no es un control: sin contorno. */
.standalone h1[tabindex="-1"]:focus-visible { outline: none; }
`;
