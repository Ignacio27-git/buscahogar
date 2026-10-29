// ROADMAP 3.4 (decisión 263; R10.4, D21) — aviso legal (LSSI-CE). La identidad del titular sale de
// `LEGAL_OWNER_*` (`server/legal-identity.ts`): sin definir, cada dato es un marcador visible y nunca una
// identidad inventada. Texto informativo: lo revisa el responsable, no afirma cumplimiento normativo.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { LegalFacts, LegalValue } from '@/components/legal-facts';
import { TileAttribution } from '@/components/tile-attribution';
import { readTileConfig } from '@/server/env';
import { readLegalIdentity } from '@/server/legal-identity';

export const metadata: Metadata = { title: 'Aviso legal' };

const LSSI_HREF = 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758';
const IGN_HREF = 'https://www.ign.es';
const CC_BY_HREF = 'https://creativecommons.org/licenses/by/4.0/deed.es';

export default function NoticePage(): ReactElement {
  const identity = readLegalIdentity();
  const tiles = readTileConfig();

  return (
    <article className="legal-page">
      <h1>Aviso legal</h1>
      <p className="legal-page__lead">
        Información del titular de este sitio web, a la que se refiere el artículo 10 de la{' '}
        <a href={LSSI_HREF}>
          Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio
          electrónico (LSSI-CE)
        </a>
        .
      </p>

      <section>
        <h2>Titular</h2>
        <LegalFacts
          facts={[
            { label: 'Titular', value: <LegalValue field={identity.name} /> },
            { label: 'NIF o CIF', value: <LegalValue field={identity.taxId} /> },
            { label: 'Domicilio', value: <LegalValue field={identity.address} /> },
            { label: 'Correo electrónico', value: <LegalValue field={identity.email} mailto /> },
          ]}
        />
      </section>

      <section>
        <h2>Qué es Buscahogar</h2>
        <p>
          Buscahogar reúne en una sola búsqueda anuncios de vivienda de varias fuentes, agrupa los
          que corresponden a la misma vivienda y enlaza con el anuncio original. No es una
          inmobiliaria y no interviene en las operaciones.
        </p>
        <p>
          Los anuncios los publican terceros: Buscahogar no los redacta ni garantiza su exactitud.
          El precio, la disponibilidad y la ubicación, que puede ser aproximada, pueden haber
          cambiado; comprueba siempre el anuncio original antes de decidir.
        </p>
      </section>

      <section>
        <h2>Contenidos y atribuciones</h2>
        <p>
          El contenido de cada anuncio pertenece a su autor y a su fuente. Los datos de municipios y
          entidades de población proceden del Nomenclátor Geográfico de Municipios y Entidades de
          Población (NGMEP) del <a href={IGN_HREF}>Instituto Geográfico Nacional (IGN)</a> y el
          Centro Nacional de Información Geográfica (CNIG), bajo licencia{' '}
          <a href={CC_BY_HREF}>CC-BY 4.0</a>. Mapa:{' '}
          <TileAttribution attribution={tiles.attribution} />
        </p>
      </section>

      <section>
        <h2>Datos personales y cookies</h2>
        <p>
          Cómo tratamos los datos está en la <a href="/legal/privacy">política de privacidad</a>, y
          la cookie que usamos, en la <a href="/legal/cookies">política de cookies</a>.
        </p>
      </section>
    </article>
  );
}
