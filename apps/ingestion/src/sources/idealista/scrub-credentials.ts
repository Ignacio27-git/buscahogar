// Paso 1.6 — scrubCredentials (diseño D5). Reimplementación deliberada de
// `scrubCredentials` en scripts/probe-idealista.ts:70-79 — solo lectura,
// prohibido tocarlo (decisión confirmada 2). Duplicación consciente de
// ~10 líneas, no pulido opcional: el shell de este adaptador maneja la
// clave, el secreto y excerpts de cuerpo en sus logs, así que es una vía de
// fuga real (DECISIONS 033/034). Extendida sobre la sonda para cubrir
// también el token de acceso, ausente en scripts/probe-idealista.ts porque
// esa sonda nunca loguea el cuerpo de una respuesta 2xx de token.
export interface ScrubbableCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly accessToken?: string;
}

export function scrubCredentials(text: string, credentials: ScrubbableCredentials): string {
  let scrubbed = text;
  for (const secret of [credentials.apiKey, credentials.apiSecret, credentials.accessToken]) {
    if (secret !== undefined && secret.length > 0) {
      scrubbed = scrubbed.split(secret).join('[REDACTED]');
    }
  }
  return scrubbed;
}
