// ROADMAP 1.15 (security-hardening, spec #261 "Per-Client Coverage Limit
// Is Enforced In PostgreSQL, Keyed By An HMAC-SHA256 Digest, Never The Raw
// Value", diseño decisión 076) — deriva la clave opaca almacenada en
// `coverage_client_quota.key_hash`. Puro en el sentido operativo (nunca lee
// `process.env` ni `next/headers` por sí mismo): identidad y clave HMAC
// llegan YA resueltas por el llamador (`env.ts`, `coverage-client.ts`).
//
// PROXY-REACHABLE (diseño decisión 081): sin `import 'server-only'` —
// `proxy.ts` reutiliza esta función para indexar el limitador en memoria,
// y no se ha verificado que el runtime de Proxy admita ese guard.
import { createHmac } from 'node:crypto';

export function hmacClientKey(identity: string, hmacKey: string): string {
  return createHmac('sha256', hmacKey).update(identity).digest('hex');
}
