// D.9 (decisión 174) — descripción de la vivienda partida en párrafos. Sin
// descripción no hay sección, y esa ausencia no activa la nota de «No consolidado».
import type { ReactElement } from 'react';

import { splitParagraphs } from '@/lib/split-paragraphs';

export interface PropertyDescriptionProps {
  readonly description: string | null;
}

export function PropertyDescription({ description }: PropertyDescriptionProps): ReactElement | null {
  const paragraphs = splitParagraphs(description);
  if (paragraphs.length === 0) {
    return null;
  }
  return (
    <section className="property-description">
      <h2>Descripción</h2>
      {paragraphs.map((paragraph, index) => (
        // El orden de los bloques es estable y puede haber bloques repetidos: el índice es la clave.
        <p key={index}>{paragraph}</p>
      ))}
    </section>
  );
}
