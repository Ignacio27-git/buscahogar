// ROADMAP 2.5 (refresh-retention-policy, S1; decisión 102, spec QSR-3,
// S-QSR-7, S-QSR-8) — `recordZoneQuerySignalSafely`: el registro de la señal
// de demanda NUNCA rompe la búsqueda. Cualquier fallo (INSERT, credencial
// ausente, error no-Error) se captura y se registra con un mensaje SIN
// credenciales; la respuesta se sigue renderizando.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@buscahogar/db';

const recordZoneQuerySignalMock = vi.fn<(db: Database, zoneId: string) => Promise<void>>();

vi.mock('@buscahogar/db', () => ({
  recordZoneQuerySignal: recordZoneQuerySignalMock,
}));

const { recordZoneQuerySignalSafely } = await import('../src/server/query-signal.js');

const FAKE_DB = { marker: 'coverage-db' } as unknown as Database;

describe('recordZoneQuerySignalSafely — nunca lanza (QSR-3, S-QSR-7)', () => {
  beforeEach(() => {
    recordZoneQuerySignalMock.mockReset();
  });

  it('camino feliz: obtiene el handle de escritura y registra la señal de la zona, sin log', async () => {
    recordZoneQuerySignalMock.mockResolvedValue(undefined);
    const log = vi.fn();

    await recordZoneQuerySignalSafely(() => FAKE_DB, 'zone-1', log);

    expect(recordZoneQuerySignalMock).toHaveBeenCalledTimes(1);
    expect(recordZoneQuerySignalMock).toHaveBeenCalledWith(FAKE_DB, 'zone-1');
    expect(log).not.toHaveBeenCalled();
  });

  it('el INSERT lanza: la promesa RESUELVE y se registra un mensaje sin la credencial de la cadena de conexión', async () => {
    recordZoneQuerySignalMock.mockRejectedValue(
      new Error('connect ECONNREFUSED postgresql://web_coverage:s3cr3t-pass@db.internal:5432/buscahogar')
    );
    const log = vi.fn();

    await expect(recordZoneQuerySignalSafely(() => FAKE_DB, 'zone-1', log)).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0]?.[0]);
    expect(message).toMatch(/señal de demanda/);
    expect(message).toMatch(/ECONNREFUSED/);
    expect(message).not.toMatch(/s3cr3t-pass/);
    expect(message).not.toMatch(/postgresql:\/\//);
  });

  it('falta WEB_COVERAGE_DATABASE_URL (getWriteDb lanza): resuelve, registra el motivo y NO llega a intentar el INSERT', async () => {
    const log = vi.fn();

    await expect(
      recordZoneQuerySignalSafely(
        () => {
          throw new Error('WEB_COVERAGE_DATABASE_URL no está definida');
        },
        'zone-1',
        log
      )
    ).resolves.toBeUndefined();

    expect(recordZoneQuerySignalMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toMatch(/WEB_COVERAGE_DATABASE_URL/);
  });

  it('un valor lanzado que no es un Error también se captura', async () => {
    recordZoneQuerySignalMock.mockRejectedValue('fallo-en-texto-plano');
    const log = vi.fn();

    await expect(recordZoneQuerySignalSafely(() => FAKE_DB, 'zone-1', log)).resolves.toBeUndefined();

    expect(String(log.mock.calls[0]?.[0])).toMatch(/fallo-en-texto-plano/);
  });
});

describe('query-signal.ts — sin fuentes externas ni ingesta (QSR-6, S-QSR-8)', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/server/query-signal.ts', import.meta.url)), 'utf8');
  const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');

  it('sus imports son solo server-only y @buscahogar/db: nada de apps/ingestion, sources/ ni clientes HTTP', () => {
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(/ingestion|sources\/|undici|axios|node-fetch/);
    }
    expect(specifiers).toContain('@buscahogar/db');
  });

  it('no llama a fetch ni expone ninguna variable NEXT_PUBLIC_*', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/NEXT_PUBLIC_/);
  });
});
