// Paso D.1b (spec a11y-baseline R12/R13; diseño A7, decisión 138) — lógica PURA
// de la línea base de accesibilidad: huella, comparación y fusión. Sin
// dependencia de Playwright ni de axe, para probarla con vitest
// (`test/e2e-axe-baseline.test.ts`).
//
// Una huella es `regla|objetivo`. La comparación es por CONJUNTOS (el orden no
// importa). Falla tanto una huella nueva como una obsoleta: una entrada
// obsoleta dejaría pasar sin aviso que la violación vuelva a aparecer.

// Etiquetas de reglas de axe que se evalúan (S12.1). Cambiarlas invalida la línea base.
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

export interface AxeBaseline {
  schemaVersion: 1;
  tags: string[];
  // ruta -> proyecto -> huellas
  entries: Record<string, Record<string, string[]>>;
}

export interface AxeViolationInput {
  id: string;
  nodes: readonly { target: readonly (string | readonly string[])[] }[];
}

export interface StagedEntry {
  route: string;
  project: string;
  fingerprints: string[];
}

export type ComparisonResult =
  | { ok: true }
  | { ok: false; reason: 'missing-key' }
  | { ok: false; reason: 'tag-mismatch' }
  | {
      ok: false;
      reason: 'drift';
      newFingerprints: string[];
      staleFingerprints: string[];
    };

const FRAME_SEPARATOR = ' >>> ';

// Aplana el `target` de axe: cada segmento es un selector (cadena) o, para
// shadow DOM, un arreglo de selectores. Los marcos se unen con « >>> ».
export function normalizeTarget(target: readonly (string | readonly string[])[]): string {
  return target
    .map((segment) => (typeof segment === 'string' ? segment : segment.join(FRAME_SEPARATOR)))
    .join(FRAME_SEPARATOR)
    .replace(/\s+/g, ' ')
    .trim();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function fingerprintViolations(violations: readonly AxeViolationInput[]): string[] {
  return sortedUnique(
    violations.flatMap((violation) =>
      violation.nodes.map((node) => `${violation.id}|${normalizeTarget(node.target)}`)
    )
  );
}

export function compareToBaseline(
  baseline: AxeBaseline | null,
  route: string,
  project: string,
  current: readonly string[],
  tags: readonly string[]
): ComparisonResult {
  const recorded = baseline?.entries[route]?.[project];
  if (baseline === null || recorded === undefined) {
    return { ok: false, reason: 'missing-key' };
  }
  if (sortedUnique(baseline.tags).join(',') !== sortedUnique(tags).join(',')) {
    return { ok: false, reason: 'tag-mismatch' };
  }

  const recordedSet = new Set(recorded);
  const currentSet = new Set(current);
  const newFingerprints = sortedUnique(current.filter((f) => !recordedSet.has(f)));
  const staleFingerprints = sortedUnique(recorded.filter((f) => !currentSet.has(f)));
  if (newFingerprints.length === 0 && staleFingerprints.length === 0) {
    return { ok: true };
  }
  return { ok: false, reason: 'drift', newFingerprints, staleFingerprints };
}

export function formatComparisonFailure(
  route: string,
  project: string,
  result: Extract<ComparisonResult, { ok: false }>
): string {
  const where = `ruta «${route}», proyecto «${project}»`;
  const update =
    'Ejecuta `pnpm e2e:update` (test:e2e:update en Docker) para reescribir la línea base.';
  if (result.reason === 'missing-key') {
    return `Falta la entrada de la línea base axe para ${where}. ${update}`;
  }
  if (result.reason === 'tag-mismatch') {
    return `Las etiquetas de la línea base axe no coinciden con las de la ejecución (${where}). ${update}`;
  }
  const lines = [`La línea base axe no coincide en ${where}.`];
  if (result.newFingerprints.length > 0) {
    lines.push(
      `Violaciones NUEVAS (no están en la línea base):`,
      ...result.newFingerprints.map((f) => `  + ${f}`)
    );
  }
  if (result.staleFingerprints.length > 0) {
    lines.push(
      `Entradas OBSOLETAS (ya no se reproducen; ¿corregidas?):`,
      ...result.staleFingerprints.map((f) => `  - ${f}`)
    );
  }
  lines.push(update);
  return lines.join('\n');
}

// Fusiona las claves preparadas en la línea base existente. Cada clave (ruta,
// proyecto) preparada se REEMPLAZA entera, de modo que las huellas obsoletas
// desaparecen; las claves no preparadas (ejecución parcial) se conservan.
export function mergeBaseline(
  existing: AxeBaseline | null,
  staged: readonly StagedEntry[],
  tags: readonly string[]
): AxeBaseline {
  const entries: Record<string, Record<string, string[]>> = {};
  for (const [route, projects] of Object.entries(existing?.entries ?? {})) {
    entries[route] = { ...projects };
  }
  for (const { route, project, fingerprints } of staged) {
    entries[route] = { ...entries[route], [project]: sortedUnique(fingerprints) };
  }
  return { schemaVersion: 1, tags: [...tags], entries };
}

// JSON estable: rutas, proyectos y huellas ordenados, 2 espacios, LF y salto final.
export function serializeBaseline(baseline: AxeBaseline): string {
  const entries: Record<string, Record<string, string[]>> = {};
  for (const route of Object.keys(baseline.entries).sort()) {
    const projects = baseline.entries[route] ?? {};
    const sortedProjects: Record<string, string[]> = {};
    for (const project of Object.keys(projects).sort()) {
      sortedProjects[project] = sortedUnique(projects[project] ?? []);
    }
    entries[route] = sortedProjects;
  }
  const ordered: AxeBaseline = {
    schemaVersion: 1,
    tags: sortedUnique(baseline.tags),
    entries,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
