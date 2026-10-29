// D.22 (decisión 266) — marca «casa encontrada»: una lupa de tinta cuya lente contiene una casa
// sólida en azul de marca, con la puerta recortada (`evenodd`). Una sola fuente de geometría:
// `components/brand-mark.tsx` la pinta como elemento React, `brandMarkSvg()` como cadena para las
// páginas autónomas (`global-error`, 429) y `test/app-icons.test.ts` fija que `app/icon.svg` copia
// estos mismos datos. La paridad React / cadena la comprueba `test/brand-mark.test.tsx`.
//
// Módulo puro y sin `server-only`: lo alcanza el proxy (`server/rate-limit-page.ts`) fuera del grafo de
// componentes de servidor, como `standalone-page.ts`. Sin ningún literal de color: la tinta es
// `currentColor` y la casa recibe `var(--accent)` desde el CSS (`.brand-mark__house`), así que la marca
// sigue al tema sin tokens nuevos. La casa no lleva atributo `fill` y el `<svg>` va con `fill="none"`:
// sin CSS la casa no se pinta (solo la lupa), nunca aparece en negro.
export const BRAND_MARK = {
  viewBox: '0 0 32 32',
  lens: { cx: 13.5, cy: 13.5, r: 10, strokeWidth: 3 },
  handle: { d: 'M21 21l7.5 7.5', strokeWidth: 4 },
  house: { d: 'M13.5 7.5 18.5 12v6.5h-10V12Zm-1 6.5h2v4.5h-2Z' },
} as const;

// Misma serialización que `renderToStaticMarkup(<BrandMark />)`: mismos atributos y en el mismo orden.
export function brandMarkSvg(): string {
  const { viewBox, lens, handle, house } = BRAND_MARK;
  return (
    `<svg class="brand-mark" viewBox="${viewBox}" fill="none" aria-hidden="true" focusable="false">` +
    `<circle cx="${String(lens.cx)}" cy="${String(lens.cy)}" r="${String(lens.r)}" stroke="currentColor" stroke-width="${String(lens.strokeWidth)}"></circle>` +
    `<path d="${handle.d}" stroke="currentColor" stroke-width="${String(handle.strokeWidth)}" stroke-linecap="round"></path>` +
    `<path class="brand-mark__house" fill-rule="evenodd" d="${house.d}"></path>` +
    '</svg>'
  );
}
