// ROADMAP 2.2 — runComparison (decisión 091): shell de CLI DB-free, sin red
// ni `.env` (D6, spec "No Database, Network, or Environment Dependency").
// `CliIo` fake sustituye por completo `console.log`/`fs.writeFileSync` — la
// suite entera además corre bajo setup-no-network.ts (vitest.config.ts), así
// que ninguna petición real podría escapar sin que la suite entera fallase.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { runComparison } from '../scripts/compare-dedup-strategies.js';
import type { CliIo } from '../scripts/compare-dedup-strategies.js';

function fakeIo(overrides: Partial<CliIo> = {}): { io: CliIo; logs: string[]; writes: { path: string; text: string }[] } {
  const logs: string[] = [];
  const writes: { path: string; text: string }[] = [];
  const io: CliIo = {
    log: (line: string) => logs.push(line),
    writeFile: (path: string, text: string) => writes.push({ path, text }),
    ...overrides,
  };
  return { io, logs, writes };
}

describe('runComparison — CLI DB-free, sin red ni .env (D6)', () => {
  it('exit 0 en éxito; sin --output, el reporte se loguea (una sola línea)', () => {
    const { io, logs, writes } = fakeIo();

    const exitCode = runComparison(['--format', 'json'], io);

    expect(exitCode).toBe(0);
    expect(writes).toHaveLength(0);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0] ?? '') as { corpusSize: number; strategies: readonly { name: string }[] };
    expect(parsed.corpusSize).toBe(24);
    // ROADMAP 2.3 (Phase 4, spec "Four Evaluator Rows"): rule-based,
    // rule-based+image, Fellegi-Sunter, Fellegi-Sunter+image, en ese orden.
    expect(parsed.strategies).toHaveLength(4);
    expect(parsed.strategies.map((s) => s.name)).toEqual([
      'rule-based-structured',
      'rule-based-structured+image-phash',
      'probabilistic-fellegi-sunter',
      'probabilistic-fellegi-sunter+image-phash',
    ]);
  });

  it('exit 2 con un flag desconocido; ninguna salida de reporte', () => {
    const { io, logs } = fakeIo();

    const exitCode = runComparison(['--formato', 'json'], io);

    expect(exitCode).toBe(2);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/formato/);
  });

  it('exit 2 con una rejilla inválida (low >= high), nombrando la tupla, sin salida de reporte', () => {
    const { io, logs } = fakeIo();

    const exitCode = runComparison(['--high', '0.5', '--low', '0.6'], io);

    expect(exitCode).toBe(2);
    expect(logs[0]).toMatch(/0\.5/);
  });

  it('con --output, escribe a fichero en vez de loguear', () => {
    const { io, logs, writes } = fakeIo();

    const exitCode = runComparison(['--format', 'csv', '--output', 'reporte.csv'], io);

    expect(exitCode).toBe(0);
    expect(logs).toHaveLength(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe('reporte.csv');
    expect(writes[0]?.text).toContain('strategy,strategy_version');
    // ROADMAP 2.3 (Phase 4): las dos columnas nuevas llegan hasta el CSV real
    // de la CLI, no solo a render.ts en aislamiento.
    expect(writes[0]?.text).toContain(',evidence,image_caveat');
  });

  it('el propio módulo no importa @buscahogar/db ni nada de src/sources/** (D6: cero red, cero base de datos)', () => {
    const source = readFileSync(new URL('../scripts/compare-dedup-strategies.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/@buscahogar\/db/);
    expect(source).not.toMatch(/sources\//);
    expect(source).not.toMatch(/\bfetch\(/);
  });

  it('ROADMAP 2.3 (Phase 4): las filas con imagen llevan evidence=structured+simulated-image; las estructuradas evidence=structured', () => {
    const { io, logs } = fakeIo();

    runComparison(['--format', 'json'], io);

    const parsed = JSON.parse(logs[0] ?? '') as {
      strategies: readonly { name: string; evidence: string }[];
    };
    const byName = new Map(parsed.strategies.map((s) => [s.name, s.evidence]));
    expect(byName.get('rule-based-structured')).toBe('structured');
    expect(byName.get('rule-based-structured+image-phash')).toBe('structured+simulated-image');
    expect(byName.get('probabilistic-fellegi-sunter')).toBe('structured');
    expect(byName.get('probabilistic-fellegi-sunter+image-phash')).toBe('structured+simulated-image');
  });
});
