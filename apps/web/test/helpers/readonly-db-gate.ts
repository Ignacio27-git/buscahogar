// ROADMAP 1.13, hallazgo W5 de sdd-verify (obs #231/#232 revisión 2) —
// activa la suite de privilegios del rol de solo lectura solo cuando
// `WEB_DATABASE_URL` está definida. Mismo patrón EXACTO que
// `describeWithCoverageDb` (`coverage-db-gate.ts`), variable distinta a
// propósito: `WEB_DATABASE_URL` es la cadena de conexión real de
// `web_readonly` (docs/DECISIONS.md, decisión 056; `docker-compose.yml`,
// servicio `web`), NUNCA `DATABASE_URL` — esa última, cargada del mismo
// `.env` de la raíz por `test/setup-env.ts`, es la credencial del
// PROPIETARIO que el resto de la suite de integración usa para sembrar
// (`db-client.ts`), y conectar con ella no demostraría nada sobre lo que
// `web_readonly` puede o no puede hacer.
import { describe } from 'vitest';

export function describeWithReadonlyDb(name: string, factory: () => void): void {
  if (process.env.WEB_DATABASE_URL) {
    describe(name, factory);
  } else {
    describe.skip(name, factory);
  }
}
