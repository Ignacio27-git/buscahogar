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
// Módulo puro y sin `server-only`: el proxy lo alcanza fuera del grafo de componentes de servidor.
export const STANDALONE_PAGE_CSS = `:root {
  color-scheme: light dark;
  --surface: #ffffff;
  --surface-raised: #ffffff;
  --surface-sunken: oklch(97% 0.004 92);
  --ink: #1c1f22;
  --ink-muted: oklch(50% 0.012 235);
  --rule: #e4e2dc;
  --rule-control: oklch(62% 0.01 235);
  --accent: #1f5fa8;
  --focus: #1f5fa8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: oklch(20% 0.008 235);
    --surface-raised: oklch(24% 0.009 235);
    --surface-sunken: oklch(16% 0.007 235);
    --ink: oklch(92% 0.008 90);
    --ink-muted: oklch(70% 0.012 235);
    --rule: oklch(32% 0.008 235);
    --rule-control: oklch(56% 0.012 235);
    --accent: oklch(72% 0.12 252);
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
  min-height: 2.5rem;
  font-size: 1.125rem;
  line-height: 1.5rem;
  font-weight: 600;
  color: var(--ink);
  text-decoration-line: none;
}
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
  border-radius: 0.25rem;
  font: inherit;
  cursor: pointer;
}
.standalone button:active { background-color: var(--surface-sunken); border-color: var(--ink); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* El título que recibe el foco por programa (frontera de error) no es un control: sin contorno. */
.standalone h1[tabindex="-1"]:focus-visible { outline: none; }
`;
