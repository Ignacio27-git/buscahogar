// ROADMAP 1.12 (diseño D7; arbitraje obs #193 AR-9/AR-11) — carrusel
// CSS-only: tira `overflow-x-auto` con `snap-x snap-mandatory` (Tailwind,
// nunca CSS a mano — AR-11 revocó la elección original del diseño de
// `globals.css` porque sí se pudo verificar que Tailwind 4.3.3 trae
// `scroll-snap`/`scroll-margin` como utilidades), y navegación previa/
// siguiente como anclas de la misma página (`<a href="#source-slide-…">`),
// nunca JavaScript. Server Component puro (D10): sin `'use client'`.
//
// Cada slide lleva SU PROPIO enlace "anterior"/"siguiente" apuntando al id
// del slide vecino en el array — nunca a un id inventado, así que a N=1 no
// hay vecino y no se renderiza ningún ancla (requisito de la spec: "no
// dangling nav"). Esto reemplaza la idea de un control global prev/next
// fijo, que necesitaría saber cuál es el slide activo — algo que sin
// JavaScript no es observable desde el servidor.
import Image from 'next/image';
import type { ReactElement } from 'react';

import type { PropertyDetailSource } from '@buscahogar/db';

export interface SourceGalleryProps {
  readonly sources: readonly PropertyDetailSource[];
}

interface Slide {
  readonly id: string;
  readonly url: string;
}

// Solo las fuentes con miniatura entran a la galería (AR-9 no exige más);
// una fuente sin `thumbnailUrl` no aporta ninguna imagen que enseñar.
function collectSlides(sources: readonly PropertyDetailSource[]): readonly Slide[] {
  const slides: Slide[] = [];
  for (const source of sources) {
    if (source.thumbnailUrl !== null) {
      slides.push({ id: `source-slide-${source.listingId}`, url: source.thumbnailUrl });
    }
  }
  return slides;
}

export function SourceGallery({ sources }: SourceGalleryProps): ReactElement | null {
  const slides = collectSlides(sources);

  if (slides.length === 0) {
    // Ninguna fuente tiene miniatura: nada que desplazar. No es el caso
    // común (obs #189), pero degradar a "nada" es más honesto que renderizar
    // un carrusel vacío con controles que no llevan a ningún sitio.
    return null;
  }

  return (
    <div className="flex snap-x snap-mandatory overflow-x-auto scroll-mt-4">
      {slides.map((slide, index) => {
        const prev = index > 0 ? slides[index - 1] : undefined;
        const next = index < slides.length - 1 ? slides[index + 1] : undefined;
        return (
          <div key={slide.id} id={slide.id} className="shrink-0 snap-center scroll-mt-4">
            <Image src={slide.url} alt="" width={480} height={360} />
            {prev !== undefined || next !== undefined ? (
              <nav aria-label="Navegación de la galería">
                {prev !== undefined ? <a href={`#${prev.id}`}>Anterior</a> : null}
                {next !== undefined ? <a href={`#${next.id}`}>Siguiente</a> : null}
              </nav>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
