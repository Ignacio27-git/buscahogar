// ROADMAP 1.12 (diseño D7; arbitraje obs #193 AR-9/AR-11) — carrusel
// CSS-only: tira `overflow-x-auto` con `snap-x snap-mandatory` (Tailwind,
// nunca CSS a mano — AR-11), y navegación previa/siguiente como anclas de la
// misma página (`<a href="#source-slide-…">`), nunca JavaScript. Server
// Component puro (D10): sin `'use client'`.
//
// D.9 (decisión 172): patrón de carrusel de la APG sin avance automático —
// región con nombre, cada foto es un grupo con el pie visible «Foto N de M ·
// {Fuente}» como nombre accesible. La imagen rellena una caja 4:3 (`fill` +
// `sizes`, sin `priority`) y los controles van en un `div`, no en un `<nav>`
// por foto (varios landmarks con el mismo nombre).
//
// Cada slide lleva SU PROPIO enlace «anterior»/«siguiente» apuntando al id del
// slide vecino en el array — nunca a un id inventado: sin vecino no hay ancla,
// y no existe una rama para una sola foto.
import Image from 'next/image';
import type { ReactElement } from 'react';

import type { PropertyDetailSource } from '@buscahogar/db';

import { sourceLabel } from '@/lib/search-labels';

export interface SourceGalleryProps {
  readonly sources: readonly PropertyDetailSource[];
}

interface Slide {
  readonly id: string;
  readonly url: string;
  readonly label: string;
}

// Solo las fuentes con miniatura entran a la galería; una fuente sin
// `thumbnailUrl` no aporta ninguna imagen que enseñar.
function collectSlides(sources: readonly PropertyDetailSource[]): readonly Slide[] {
  const slides: Slide[] = [];
  for (const source of sources) {
    if (source.thumbnailUrl !== null) {
      slides.push({
        id: `source-slide-${source.listingId}`,
        url: source.thumbnailUrl,
        label: sourceLabel(source.sourceKey),
      });
    }
  }
  return slides;
}

export function SourceGallery({ sources }: SourceGalleryProps): ReactElement | null {
  const slides = collectSlides(sources);

  if (slides.length === 0) {
    // Ninguna fuente tiene miniatura: nada que desplazar. Degradar a "nada" es
    // más honesto que un carrusel vacío con controles que no llevan a ningún sitio.
    return null;
  }

  return (
    <section aria-roledescription="carrusel" aria-label="Fotos de la vivienda" className="property-gallery">
      <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {slides.map((slide, index) => {
          const prev = index > 0 ? slides[index - 1] : undefined;
          const next = index < slides.length - 1 ? slides[index + 1] : undefined;
          const captionId = `${slide.id}-caption`;
          return (
            <div
              key={slide.id}
              id={slide.id}
              role="group"
              aria-roledescription="diapositiva"
              aria-labelledby={captionId}
              className="basis-full shrink-0 snap-start"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-(--radius-panel) bg-surface-sunken">
                <Image
                  src={slide.url}
                  alt={`Foto del anuncio de ${slide.label}`}
                  fill
                  sizes="(min-width: 64rem) 48rem, 100vw"
                  className="object-cover"
                />
              </div>
              <p id={captionId} className="mt-2 text-dense text-ink-muted">
                {`Foto ${String(index + 1)} de ${String(slides.length)} · ${slide.label}`}
              </p>
              <div className="flex gap-4 text-dense">
                {prev !== undefined ? <a href={`#${prev.id}`}>Foto anterior</a> : null}
                {next !== undefined ? <a href={`#${next.id}`}>Foto siguiente</a> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
