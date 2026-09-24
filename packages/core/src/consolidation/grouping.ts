// ROADMAP 1.10 — algoritmo de agrupación (D3 del diseño; docs/DECISIONS.md,
// decisión 052), PURA: solo ids en forma de string y ClassifiedPair, sin
// ORM, sin Next, sin efectos secundarios. Convierte clasificaciones por
// pares (accept/undecided/reject) en propiedades canónicas.
//
// Los cinco pasos exactos de D3, en orden:
//   1. union-find sobre listingIds.
//   2. cierre transitivo SOLO sobre aristas 'accept'. 'undecided' y los
//      pares nunca comparados quedan ignorados por completo (Q2a + D2: el
//      silencio no es evidencia contra fusionar).
//   3. el chequeo de conflicto lee la partición YA completa — el paso 2
//      termina antes de empezar el paso 3, así que ningún 'reject' se
//      evalúa nunca contra un componente a medio construir.
//   4. un componente en conflicto se RECHAZA ENTERO, nunca se divide (N2,
//      D2): cada miembro se convierte en su propia propiedad singleton, y
//      el componente completo se reporta como RefusedComponent.
//   5. cada grupo se ordena por listings.id ASC; los grupos se ordenan
//      entre sí por su primer id ASC — determinismo por construcción
//      (GROUP-4a), no una propiedad accidental del orden de iteración.
import type { ClassifiedPair } from '../types/classified-pair.js';

export interface PropertyGroup {
  readonly listingIds: readonly string[];
}

export interface RefusedComponent {
  readonly listingIds: readonly string[];
  readonly conflictingPairs: readonly ClassifiedPair[];
}

export interface GroupingResult {
  // Incluye los miembros de un componente rechazado, cada uno como su
  // propio grupo de un solo elemento (D2) — CONS-4/EVID-3 exigen que ningún
  // listing quede sin propiedad.
  readonly groups: readonly PropertyGroup[];
  // Solo a efectos de reporte (la cola de revisión manual de D9); no
  // participa en ninguna decisión posterior.
  readonly refusedComponents: readonly RefusedComponent[];
}

export function buildPropertyGroups(
  listingIds: readonly string[],
  pairs: readonly ClassifiedPair[]
): GroupingResult {
  // Union-find sobre un Map, no un array indexado: los ids son uuids de
  // `listings.id`, no índices densos. Un id ausente del mapa se trata como
  // su propia raíz por defecto (find), así que no hace falta poblar el
  // mapa por adelantado con listingIds — cualquier id se comporta como
  // singleton hasta que una arista 'accept' lo una a otro.
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  function find(id: string): string {
    const current = parent.get(id) ?? id;
    if (current === id) {
      return id;
    }
    const root = find(current);
    parent.set(id, root); // compresión de camino
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) {
      return;
    }
    const rankA = rank.get(rootA) ?? 0;
    const rankB = rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  }

  // Paso 2: cierre transitivo solo sobre 'accept'.
  for (const candidatePair of pairs) {
    if (candidatePair.band === 'accept') {
      union(candidatePair.listingAId, candidatePair.listingBId);
    }
  }

  // Paso 3: el chequeo de conflicto lee la partición ya completa. Un
  // 'reject' solo cuenta como conflicto si sus dos extremos terminaron en
  // el MISMO componente — un reject entre dos componentes que de todas
  // formas no iban a fusionarse no rechaza nada.
  const conflictsByRoot = new Map<string, ClassifiedPair[]>();
  for (const candidatePair of pairs) {
    if (candidatePair.band !== 'reject') {
      continue;
    }
    const rootA = find(candidatePair.listingAId);
    const rootB = find(candidatePair.listingBId);
    if (rootA === rootB) {
      const existing = conflictsByRoot.get(rootA);
      if (existing) {
        existing.push(candidatePair);
      } else {
        conflictsByRoot.set(rootA, [candidatePair]);
      }
    }
  }

  // Todo listingId recibido pertenece a un componente, incluso si nunca
  // apareció en ningún par (EVID-3/PROP-3b): itera sobre listingIds, no
  // sobre las claves del union-find.
  const membersByRoot = new Map<string, string[]>();
  for (const id of listingIds) {
    const root = find(id);
    const members = membersByRoot.get(root);
    if (members) {
      members.push(id);
    } else {
      membersByRoot.set(root, [id]);
    }
  }

  const groups: PropertyGroup[] = [];
  const refusedComponents: RefusedComponent[] = [];

  for (const [root, members] of membersByRoot) {
    const conflictingPairs = conflictsByRoot.get(root);
    if (conflictingPairs) {
      // Paso 4: rechazo ENTERO — cada miembro pasa a ser su propia
      // propiedad singleton; ninguno se pierde.
      for (const memberId of members) {
        groups.push({ listingIds: [memberId] });
      }
      refusedComponents.push({
        listingIds: [...members].sort(),
        conflictingPairs,
      });
    } else {
      groups.push({ listingIds: [...members].sort() });
    }
  }

  // Paso 5: orden determinista por primer id de cada grupo.
  groups.sort((a, b) => compareByFirstId(a.listingIds, b.listingIds));
  refusedComponents.sort((a, b) => compareByFirstId(a.listingIds, b.listingIds));

  return { groups, refusedComponents };
}

function compareByFirstId(a: readonly string[], b: readonly string[]): number {
  const firstA = a[0];
  const firstB = b[0];
  if (firstA === undefined || firstB === undefined) {
    return 0;
  }
  return firstA < firstB ? -1 : firstA > firstB ? 1 : 0;
}
