// D.22 (decisión 268, HH-1..HH-4) — franja de bienvenida de la portada (la home sin parámetros).
// Server Component puro, sin `'use client'`: titular con la propuesta de valor, una frase que explica
// qué hace la plataforma, el indicador de pasos, la caja de texto promovida y unas búsquedas de ejemplo.
// Las demás ramas de la página (resultados, mapa, `?q=`, rechazos) conservan el título «Buscar vivienda» y
// no la llevan. El motivo de curvas de nivel pasa a vivir aquí; el título pinta por encima sin
// `z-index` (el CSS le da `position: relative` a todo hermano del motivo).
//
// Los ejemplos son enlaces GET por criterios (`lib/example-searches.ts`), sin zona ni `?q=`: llevan a la
// lista directamente, funcionan sin JavaScript y no pueden registrar cobertura ni gastar cuota.
import type { ReactElement } from 'react';

import { ContourMotif } from '@/components/contour-motif';
import { SearchTextForm } from '@/components/search-text-form';
import { StepIndicator } from '@/components/step-indicator';
import { EXAMPLE_SEARCHES, exampleSearchHref } from '@/lib/example-searches';

function ExampleSearches(): ReactElement {
  return (
    <div className="example-searches">
      <p id="example-searches-label" className="example-searches__label">
        Búsquedas para empezar
      </p>
      <ul aria-labelledby="example-searches-label" className="example-searches__list">
        {EXAMPLE_SEARCHES.map((search) => (
          <li key={search.label}>
            <a href={exampleSearchHref(search)} className="example-searches__link">
              {search.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomeHero(): ReactElement {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <ContourMotif />
      <h1 id="home-hero-title">Todas las viviendas de los portales, en una sola búsqueda</h1>
      <p className="home-hero__lead">
        Reunimos los anuncios de varios portales y juntamos los que son la misma casa, para que veas cada vivienda
        una vez y con su precio más bajo.
      </p>
      <StepIndicator current={1} />
      <SearchTextForm value="" open />
      <ExampleSearches />
    </section>
  );
}
