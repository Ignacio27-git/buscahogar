// D.7 (decisión 157) — indicador de los tres pasos de la búsqueda en lenguaje
// natural: describir, revisar y buscar. Server Component puro, sin
// `'use client'`. Va fuera del formulario `role="search"` y solo lo pinta la
// página donde el flujo ocurre (inicio y rama `?q=`); el paso actual se marca
// con `aria-current="step"`, no solo con color.
import type { ReactElement } from 'react';

const STEP_LABELS = ['Describe', 'Revisa', 'Busca'] as const;

export function StepIndicator({ current }: { readonly current: 1 | 2 }): ReactElement {
  return (
    <ol className="steps" aria-label="Pasos de la búsqueda">
      {STEP_LABELS.map((label, index) => (
        <li key={label} aria-current={index + 1 === current ? 'step' : undefined}>
          <span aria-hidden="true" className="steps__number">
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
