// D.19 (decisión 230) — doble de `next/font/local` para vitest, con el mismo patrón que `server-only.ts`.
// El cargador real solo funciona dentro de la compilación de Next.js (lo transforma SWC/Turbopack); fuera
// de ella lanza. El doble devuelve la misma forma que el cargador (`className`, `variable`, `style`) con
// nombres reconocibles para los tests. Aliaseado en `vitest.config.ts`.
interface LocalFontOptions {
  readonly variable?: string;
}

interface LocalFontResult {
  readonly className: string;
  readonly variable: string;
  readonly style: { readonly fontFamily: string };
}

export default function localFont(_options: LocalFontOptions): LocalFontResult {
  return {
    className: 'font-figtree-stub-class',
    variable: 'font-figtree-stub',
    style: { fontFamily: "'Figtree', 'Figtree Fallback'" },
  };
}
