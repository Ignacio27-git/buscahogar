// Paso D.1b (diseño A7, decisión 138) — E/S de la línea base axe en disco.
// Solo la usan `a11y.spec.ts` y `global-teardown.ts` (Node, sin navegador); la
// lógica pura está en `axe-baseline.ts`.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { AxeBaseline, StagedEntry } from './axe-baseline';

const E2E_DIR = fileURLToPath(new URL('.', import.meta.url));
export const BASELINE_PATH = `${E2E_DIR}baselines/axe-baseline.json`;
// Dentro de `outputDir` (`test-results`): ignorado por git y limpiado por Playwright al arrancar.
export const STAGING_DIR = fileURLToPath(new URL('../test-results/axe-staging/', import.meta.url));

const baselineSchema = z.object({
  schemaVersion: z.literal(1),
  tags: z.array(z.string()),
  entries: z.record(z.string(), z.record(z.string(), z.array(z.string()))),
});

const stagedSchema = z.object({
  route: z.string(),
  project: z.string(),
  fingerprints: z.array(z.string()),
});

export function readBaseline(): AxeBaseline | null {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  return baselineSchema.parse(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));
}

export function writeBaseline(text: string): void {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, text, 'utf8');
}

export function writeStaged(entry: StagedEntry): void {
  mkdirSync(STAGING_DIR, { recursive: true });
  writeFileSync(
    `${STAGING_DIR}${entry.route}__${entry.project}.json`,
    JSON.stringify(entry),
    'utf8'
  );
}

// Lee y borra las entradas preparadas; lista vacía si no hubo ejecución de actualización.
export function takeStaged(): StagedEntry[] {
  if (!existsSync(STAGING_DIR)) {
    return [];
  }
  const entries = readdirSync(STAGING_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => stagedSchema.parse(JSON.parse(readFileSync(`${STAGING_DIR}${name}`, 'utf8'))));
  rmSync(STAGING_DIR, { recursive: true, force: true });
  return entries;
}
