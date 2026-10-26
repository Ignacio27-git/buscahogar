import type { ReactElement } from 'react';

import { STATE_ILLUSTRATIONS, VIEW_BOX } from '@/lib/state-illustrations';
import type { StateIllustrationKind } from '@/lib/state-illustrations';

// D.22 (decisión 269) — ilustración de línea de un estado, en SVG incrustado. Componente de servidor (sin
// `'use client'`): no hay fichero servido, así que no cambian la CSP ni el matcher del proxy. Es decorativa:
// `aria-hidden`, sin foco, sin rol ni nombre; el estado lo dice el texto de al lado. Los datos y la
// serialización salen de `lib/state-illustrations.ts` (`stateIllustrationSvg()` produce el mismo marcado
// para las páginas autónomas).

// `stroke-linecap` -> `strokeLinecap`: React espera los atributos SVG en camelCase.
function toReactName(name: string): string {
  return name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function StateIllustration({ kind }: { readonly kind: StateIllustrationKind }): ReactElement {
  return (
    <svg className="state-illustration" viewBox={VIEW_BOX} fill="none" aria-hidden="true" focusable="false">
      {STATE_ILLUSTRATIONS[kind].map(({ tag: Tag, className, attributes }, index) => {
        const props: Record<string, string> = { className };
        for (const [name, value] of Object.entries(attributes)) props[toReactName(name)] = value;
        return <Tag key={index} {...props} />;
      })}
    </svg>
  );
}
