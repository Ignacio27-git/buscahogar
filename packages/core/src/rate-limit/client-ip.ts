// ROADMAP 1.15 (security-hardening, spec #261 "Client Network Identity...",
// diseño decisión 075) — resuelve el valor CRUDO de una cabecera confiable
// (`CLIENT_IP_HEADER`, PR2) a una IPv4/IPv6 válida, o `null` en cualquier
// otro caso. Fail-closed por construcción, no por una lista de casos
// especiales: un valor con varias direcciones separadas por comas, o
// cualquier cadena que no sea EXACTAMENTE una IP bien formada, nunca supera
// `z.union([z.ipv4(), z.ipv6()])` — no hace falta una comprobación de
// comas aparte, la propia forma del esquema ya la rechaza (una lista con
// comas jamás es una IP válida).
import { z } from 'zod';

const clientIpSchema = z.union([z.ipv4(), z.ipv6()]);

// Bucket compartido para cuando la cabecera está configurada pero el valor
// recibido no resuelve a una IP válida — nunca "exento" ni "sin límite"
// (spec #261, escenario "missing, comma-separated, or invalid header value
// falls into one shared unknown bucket, never exempt"). Este módulo solo
// declara la constante; aplicar el fallback (`parseTrustedClientIp(x) ??
// UNKNOWN_CLIENT_IDENTITY`) es responsabilidad del llamador (PR2).
export const UNKNOWN_CLIENT_IDENTITY = 'unknown';

export function parseTrustedClientIp(raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  const result = clientIpSchema.safeParse(trimmed);
  return result.success ? result.data : null;
}
