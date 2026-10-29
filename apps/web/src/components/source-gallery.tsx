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
//
// Paso 3.4b (decisión 274): una foto que no carga se cambia por «Foto no disponible» dentro de la misma
// caja 4:3. El pie «Foto N de M» se mantiene, porque la posición en el carrusel sigue siendo cierta.
import type { ReactElement } from 'react';

import type { PropertyDetailSource } from '@buscahogar/db';

import { sourceLabel } from '@/lib/search-labels';

import { FallbackImage } from './fallback-image';

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

// D.15 (F8, decisión 200): objetivo táctil de 40 px, como los enlaces de la cabecera y del popup;
// el texto en línea medía menos de 24 px y dependía de la excepción de espaciado de 2.5.8.
const LINK_CLASS = 'inline-flex min-h-10 items-center';

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
              // D.15 (F1, decisión 200): enfocable por programa, no por Tab. Sin esto el foco se
              // queda en «Foto siguiente» al activar el enlace de fragmento. El contorno va hacia
              // dentro porque la tira recorta lo que sobresale.
              tabIndex={-1}
              className="basis-full shrink-0 snap-start focus-visible:-outline-offset-2"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-(--radius-panel) bg-surface-sunken">
                <FallbackImage
                  src={slide.url}
                  alt={`Foto del anuncio de ${slide.label}`}
                  fill
                  sizes="(min-width: 64rem) 48rem, 100vw"
                  className="object-cover"
                  fallback={
                    <span className="absolute inset-0 grid place-items-center text-dense text-ink-muted">
                      Foto no disponible
                    </span>
                  }
                />
              </div>
              <p id={captionId} className="mt-2 text-dense text-ink-muted">
                {`Foto ${String(index + 1)} de ${String(slides.length)} · ${slide.label}`}
              </p>
              <div className="flex gap-4 text-dense">
                {prev !== undefined ? (
                  <a href={`#${prev.id}`} className={LINK_CLASS}>
                    Foto anterior
                  </a>
                ) : null}
                {next !== undefined ? (
                  <a href={`#${next.id}`} className={LINK_CLASS}>
                    Foto siguiente
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
