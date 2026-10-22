// ROADMAP 3.4 (decisión 258 parte; D22) — clasificador de avisos de PRODUCCIÓN del worker. Solo NOMBRES de
// variable y motivos fijos, nunca valores. S8 lo generaliza (`env:check`, paridad con esta lista).
import { describe, expect, it } from 'vitest';

import { classifyWorkerEnv } from '../src/ops/env-warnings.js';

describe('classifyWorkerEnv — avisos de producción', () => {
  it('HEARTBEAT_URL sin definir: un aviso de producción que nombra la variable', () => {
    const issues = classifyWorkerEnv({});

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ name: 'HEARTBEAT_URL', severity: 'production-warning' });
    expect(issues[0]?.reason).toMatch(/latido|dead-man/i);
  });

  it('HEARTBEAT_URL en blanco cuenta como sin definir', () => {
    expect(classifyWorkerEnv({ HEARTBEAT_URL: '  ' }).map((issue) => issue.name)).toEqual(['HEARTBEAT_URL']);
  });

  it('HEARTBEAT_URL definida: ningún aviso, y su valor no se copia a ningún sitio', () => {
    const secret = 'https://hc-ping.example/uuid-privado';
    const issues = classifyWorkerEnv({ HEARTBEAT_URL: secret });

    expect(issues).toEqual([]);
    expect(JSON.stringify(classifyWorkerEnv({}))).not.toContain('uuid-privado');
  });
});
