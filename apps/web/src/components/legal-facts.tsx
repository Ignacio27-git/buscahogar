// ROADMAP 3.4 (decisión 263; R10.4) — piezas compartidas por las páginas legales: la lista de datos
// (identidad del titular, atributos de la cookie) y el valor de un dato de identidad, que se marca como
// pendiente cuando no está configurado. Server Components sin JavaScript de cliente.
import type { ReactElement, ReactNode } from 'react';

import type { LegalIdentityField } from '@/server/legal-identity';

export interface LegalFact {
  readonly label: string;
  readonly value: ReactNode;
}

// Lista de definiciones en filas separadas por filetes (sin tarjetas, DESIGN.md): la etiqueta va en tinta
// de leyenda y el valor en tinta principal. A partir de 40rem las filas pasan a dos columnas.
export function LegalFacts({ facts }: { readonly facts: readonly LegalFact[] }): ReactElement {
  return (
    <dl className="legal-facts">
      {facts.map((fact) => (
        <div key={fact.label} className="legal-facts__row">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Un dato sin configurar se pinta con el marcador entre corchetes y en negrita: visible, nunca disfrazado
// de dato real. Con correo, el valor configurado es un enlace `mailto:`.
export function LegalValue({
  field,
  mailto = false,
}: {
  readonly field: LegalIdentityField;
  readonly mailto?: boolean;
}): ReactElement {
  if (!field.configured) {
    return <span className="legal-pending">{field.value}</span>;
  }
  return mailto ? <a href={`mailto:${field.value}`}>{field.value}</a> : <>{field.value}</>;
}
