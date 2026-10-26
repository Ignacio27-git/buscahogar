import type { ReactElement } from 'react';

import { BRAND_MARK } from '@/lib/brand-mark';

// D.22 (decisión 266) — marca «casa encontrada» en SVG incrustado. Componente de servidor (sin
// `'use client'`): no hay fichero servido, así que no cambian la CSP ni el matcher del proxy. Es
// decorativo: `aria-hidden`, sin foco, sin rol ni nombre; el nombre accesible de la cabecera lo da el
// texto «Buscahogar» del enlace. La geometría y la serialización salen de `lib/brand-mark.ts`
// (`brandMarkSvg()` produce el mismo marcado para las páginas autónomas).
export function BrandMark(): ReactElement {
  const { viewBox, lens, handle, house } = BRAND_MARK;
  return (
    <svg className="brand-mark" viewBox={viewBox} fill="none" aria-hidden="true" focusable="false">
      <circle cx={lens.cx} cy={lens.cy} r={lens.r} stroke="currentColor" strokeWidth={lens.strokeWidth} />
      <path d={handle.d} stroke="currentColor" strokeWidth={handle.strokeWidth} strokeLinecap="round" />
      <path className="brand-mark__house" fillRule="evenodd" d={house.d} />
    </svg>
  );
}
