// ROADMAP 3.4 (decisión 259, D17; R7.2, R7.5) — comprobaciones PURAS de los avisos operativos: reciben una
// foto del estado y devuelven los avisos candidatos (clave de deduplicación, gravedad, texto en español y
// enfriamiento). Sin reloj propio, sin red, sin base de datos.
import { describe, expect, it } from 'vitest';

import {
  DAILY_ALERT_COOLDOWN_MS,
  evaluateAlertChecks,
  MONTHLY_ALERT_COOLDOWN_MS,
  WORKER_STARTED_COOLDOWN_MS,
} from '../src/alerts/checks.js';
import type { AlertCheckConfig, AlertSnapshot } from '../src/alerts/checks.js';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const CONFIG: AlertCheckConfig = {
  failedJobsThreshold: 5,
  failedJobsWindowMs: 24 * 3_600_000,
  failedJobsCooldownMs: 6 * 3_600_000,
};

function snapshot(overrides: Partial<AlertSnapshot> = {}): AlertSnapshot {
  return {
    now: NOW,
    failedJobs: 0,
    staleReclaim: undefined,
    quota: { totalCap: 1000, searchRequests: 100 },
    deniedReservations: 0,
    workerStarted: false,
    ...overrides,
  };
}

function keys(overrides: Partial<AlertSnapshot> = {}, config: AlertCheckConfig = CONFIG): readonly string[] {
  return evaluateAlertChecks(snapshot(overrides), config).map((candidate) => candidate.dedupKey);
}

describe('evaluateAlertChecks — trabajos fallidos en la ventana', () => {
  it('sin fallos ni nada que avisar no produce candidatos', () => {
    expect(evaluateAlertChecks(snapshot(), CONFIG)).toEqual([]);
  });

  it('por debajo del umbral no avisa; en el umbral exacto sí (>=)', () => {
    expect(keys({ failedJobs: 4 })).toEqual([]);
    const [candidate] = evaluateAlertChecks(snapshot({ failedJobs: 5 }), CONFIG);
    expect(candidate).toMatchObject({
      dedupKey: 'failed-jobs',
      severity: 'warning',
      cooldownMs: CONFIG.failedJobsCooldownMs,
    });
    expect(candidate?.text).toContain('5');
    expect(candidate?.text).toContain('24 h');
  });

  it('respeta un umbral y una ventana configurables', () => {
    const custom: AlertCheckConfig = { ...CONFIG, failedJobsThreshold: 2, failedJobsWindowMs: 90 * 60_000 };
    const [candidate] = evaluateAlertChecks(snapshot({ failedJobs: 2 }), custom);
    expect(candidate?.dedupKey).toBe('failed-jobs');
    expect(candidate?.text).toContain('90 min');
  });
});

describe('evaluateAlertChecks — jobs atascados recuperados', () => {
  it('usa como clave la del evento (stale-reclaim:<día UTC>) y el enfriamiento diario', () => {
    const [candidate] = evaluateAlertChecks(
      snapshot({ staleReclaim: { count: 2, alertKey: 'stale-reclaim:2026-10-22' } }),
      CONFIG
    );
    expect(candidate).toMatchObject({
      dedupKey: 'stale-reclaim:2026-10-22',
      severity: 'critical',
      cooldownMs: DAILY_ALERT_COOLDOWN_MS,
    });
    expect(candidate?.text).toContain('2');
  });

  it('sin evento no hay aviso', () => {
    expect(keys({ staleReclaim: undefined })).toEqual([]);
  });
});

describe('evaluateAlertChecks — cuota mensual', () => {
  it('79 % no avisa; 81 % da UN aviso del 80 % con la clave del mes', () => {
    expect(keys({ quota: { totalCap: 1000, searchRequests: 790 } })).toEqual([]);
    const [candidate] = evaluateAlertChecks(snapshot({ quota: { totalCap: 1000, searchRequests: 810 } }), CONFIG);
    expect(candidate).toMatchObject({
      dedupKey: 'quota-80:2026-10',
      severity: 'warning',
      cooldownMs: MONTHLY_ALERT_COOLDOWN_MS,
    });
    expect(candidate?.text).toContain('81 %');
  });

  it('el 80 % exacto ya avisa (>=) y la clave cambia con el mes', () => {
    expect(keys({ quota: { totalCap: 1000, searchRequests: 800 } })).toEqual(['quota-80:2026-10']);
    expect(
      keys({ now: new Date('2026-11-02T00:00:00.000Z'), quota: { totalCap: 1000, searchRequests: 800 } })
    ).toEqual(['quota-80:2026-11']);
  });

  it('al 100 % avisa solo del 100 % (crítico), no también del 80 %', () => {
    const candidates = evaluateAlertChecks(snapshot({ quota: { totalCap: 1000, searchRequests: 1000 } }), CONFIG);
    expect(candidates.map((candidate) => candidate.dedupKey)).toEqual(['quota-100:2026-10']);
    expect(candidates[0]?.severity).toBe('critical');
  });

  it('sin cuota mensual (monthly-missing) avisa una vez al mes', () => {
    const [candidate] = evaluateAlertChecks(snapshot({ quota: null }), CONFIG);
    expect(candidate).toMatchObject({
      dedupKey: 'quota-missing:2026-10',
      severity: 'critical',
      cooldownMs: MONTHLY_ALERT_COOLDOWN_MS,
    });
  });
});

describe('evaluateAlertChecks — reservas denegadas y arranque del worker', () => {
  it('reservas denegadas hoy: clave por día UTC y recuento en el texto', () => {
    const [candidate] = evaluateAlertChecks(snapshot({ deniedReservations: 3 }), CONFIG);
    expect(candidate).toMatchObject({
      dedupKey: 'denied-reservations:2026-10-22',
      severity: 'warning',
      cooldownMs: DAILY_ALERT_COOLDOWN_MS,
    });
    expect(candidate?.text).toContain('3');
    expect(keys({ deniedReservations: 0 })).toEqual([]);
  });

  it('arranque del worker: informativo, con enfriamiento de 1 h', () => {
    const [candidate] = evaluateAlertChecks(snapshot({ workerStarted: true }), CONFIG);
    expect(candidate).toMatchObject({ dedupKey: 'worker-started', severity: 'info', cooldownMs: 3_600_000 });
    expect(WORKER_STARTED_COOLDOWN_MS).toBe(3_600_000);
  });
});

describe('evaluateAlertChecks — contenido de los mensajes (R7.5)', () => {
  it('todos los avisos a la vez: una clave distinta cada uno y ningún secreto, URL, IP ni identificador', () => {
    const candidates = evaluateAlertChecks(
      snapshot({
        failedJobs: 9,
        staleReclaim: { count: 1, alertKey: 'stale-reclaim:2026-10-22' },
        quota: { totalCap: 1000, searchRequests: 1000 },
        deniedReservations: 4,
        workerStarted: true,
      }),
      CONFIG
    );
    const all = candidates.map((candidate) => candidate.dedupKey);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(5);
    for (const candidate of candidates) {
      expect(candidate.text).not.toMatch(/https?:|postgres|\b\d{1,3}(\.\d{1,3}){3}\b|token|secret|[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(candidate.text.length).toBeGreaterThan(10);
      expect(candidate.text.length).toBeLessThan(400);
    }
  });
});
