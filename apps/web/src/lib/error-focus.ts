// D.15 (F12, decisión 203) — foco en las fronteras de error. Al aparecer la página de error el foco
// no estaba en ningún sitio y el lector de pantalla no anunciaba nada. El título recibe el foco al
// montarse (se lee «No hemos podido cargar esta página» y el siguiente Tab llega a «Reintentar»);
// si tras un reintento con éxito la frontera se desmonta y el foco quedó perdido (el botón ya no
// existe), vuelve al contenido principal, el mismo destino que el enlace «Saltar al contenido».
// Funciones puras sobre interfaces mínimas: se prueban sin DOM.
interface Focusable {
  focus: () => void;
}

interface FocusRoot {
  readonly activeElement: unknown;
  readonly body: unknown;
  readonly documentElement: unknown;
  getElementById: (id: string) => Focusable | null;
}

// Id de `main` en el layout raíz (`app/layout.tsx`), destino del enlace «Saltar al contenido».
const MAIN_ID = 'contenido';

export function focusHeading(heading: Focusable | null): void {
  heading?.focus();
}

// «Perdido» = el navegador no tiene ningún elemento enfocado (ni `body` ni la raíz cuentan). Si el
// foco ya está en otro elemento (p. ej. se navegó con un enlace), no se le quita.
export function restoreFocusToMain(root: FocusRoot): void {
  const active = root.activeElement;
  if (active !== null && active !== root.body && active !== root.documentElement) {
    return;
  }
  root.getElementById(MAIN_ID)?.focus();
}
