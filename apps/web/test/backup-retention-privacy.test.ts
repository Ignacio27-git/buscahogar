// ROADMAP 3.4 (decisión 260, R8.2, R10.2) — la página de privacidad publica cuántas copias de seguridad se conservan;
// la retención REAL vive en `ops/backup/retention.sh`. Si alguien cambia una cifra sin la otra, el texto legal dejaría
// de ser cierto. Esta prueba lee las constantes del script (es un fichero del repositorio, no una importación entre
// aplicaciones) y exige que el texto de /legal/privacy diga exactamente lo mismo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function constant(source: string, name: string): number {
  const match = new RegExp(`^${name}=(\\d+)$`, 'm').exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`ops/backup/retention.sh ya no define ${name}`);
  }
  return Number(match[1]);
}

describe('retención de copias de seguridad: script = página de privacidad', () => {
  const retention = readFileSync(`${REPO_ROOT}ops/backup/retention.sh`, 'utf8');
  const privacy = readFileSync(new URL('../src/app/legal/privacy/page.tsx', import.meta.url), 'utf8').replace(/\s+/g, ' ');

  it('las cifras de retention.sh son las que publica /legal/privacy', () => {
    const daily = constant(retention, 'KEEP_DAILY');
    const weekly = constant(retention, 'KEEP_WEEKLY');
    const monthly = constant(retention, 'KEEP_MONTHLY');

    expect([daily, weekly, monthly]).toEqual([7, 4, 3]);
    expect(privacy).toContain(`Se conservan ${String(daily)} diarias, ${String(weekly)} semanales y ${String(monthly)} mensuales`);
  });
});
