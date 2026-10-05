// ROADMAP D.4 (decisiones 144-146) — helpers puros de la preferencia de
// tema (claro / oscuro / sistema). Sin `server-only`: no hay BD ni
// secretos. La cookie `theme` NO es una sesión (decisión 146): solo guarda
// una preferencia de presentación y la lee únicamente el script previo al
// pintado del <head>, nunca el servidor.
import { z } from 'zod';

export const THEME_COOKIE_NAME = 'theme';
export const THEME_COOKIE_MAX_AGE_SECONDS = 31_536_000;

export const themeChoiceSchema = z.enum(['light', 'dark', 'system']);
export type ThemeChoice = z.infer<typeof themeChoiceSchema>;

// Comprobación sobre la cadena cruda; la definitiva se repite tras la
// normalización de `new URL()` en `toSameOriginPath`.
export const returnPathSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((v) => v.startsWith('/') && !v.startsWith('//'))
  .refine((v) => !v.includes('\\'))
  .refine((v) => !/[\u0000-\u0020\u007f-\u00a0]|\s/.test(v))
  .refine((v) => !/%(?:[01][0-9a-f]|7f)/i.test(v));

/**
 * Normaliza `candidate` contra `origin` y devuelve ruta + query (sin hash)
 * solo si sigue en el mismo origen. Una ruta que tras normalizar empieza por
 * `//` sería protocol-relative (`/..//evil.example`), así que se descarta.
 * `/theme` se mapea a `/` para no volver al propio endpoint.
 */
export function toSameOriginPath(candidate: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) {
    return null;
  }
  if (url.pathname.startsWith('//')) {
    return null;
  }
  if (url.pathname === '/theme' || url.pathname === '/theme/') {
    return '/';
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Origen con el que se compara el Referer. Next reconstruye `request.url` con
 * `localhost` aunque el cliente entre por 127.0.0.1, así que manda la cabecera
 * `Host`. El destino es siempre una ruta relativa: un Host falseado solo
 * afecta a la propia petición. Un Host inválido se ignora.
 */
function resolvePublicOrigin(requestUrl: string, host: string | null): string {
  const requestOrigin = new URL(requestUrl);
  if (host === null) {
    return requestOrigin.origin;
  }
  try {
    const candidate = new URL(`${requestOrigin.protocol}//${host}`);
    return candidate.host === host.toLowerCase() ? candidate.origin : requestOrigin.origin;
  } catch {
    return requestOrigin.origin;
  }
}

export function resolveReturnPath(input: {
  readonly returnTo: unknown;
  readonly referer: string | null;
  readonly requestUrl: string;
  readonly host?: string | null;
}): string {
  const origin = resolvePublicOrigin(input.requestUrl, input.host ?? null);

  const parsed = returnPathSchema.safeParse(input.returnTo);
  if (parsed.success) {
    const fromReturnTo = toSameOriginPath(parsed.data, origin);
    if (fromReturnTo !== null) {
      return fromReturnTo;
    }
  }

  if (input.referer !== null) {
    const fromReferer = toSameOriginPath(input.referer, origin);
    if (fromReferer !== null) {
      return fromReferer;
    }
  }

  return '/';
}

export function isSecureRequest(requestUrl: string, forwardedProto: string | null): boolean {
  if (new URL(requestUrl).protocol === 'https:') {
    return true;
  }
  if (forwardedProto === null) {
    return false;
  }
  const first = forwardedProto.split(',')[0] ?? '';
  return first.trim().toLowerCase() === 'https';
}

export function buildThemeCookie(choice: ThemeChoice, secure: boolean): string {
  const base =
    choice === 'system'
      ? `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${THEME_COOKIE_NAME}=${choice}; Path=/; Max-Age=${String(THEME_COOKIE_MAX_AGE_SECONDS)}; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

export function buildSeeOtherResponse(location: string, setCookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' },
  });
}

export function buildBadRequestResponse(): Response {
  return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

// Script estático del <head>: añade `.light` / `.dark` a <html> antes del
// primer pintado. Sin `</` para no cerrar el elemento <script>.
export const THEME_INIT_SCRIPT =
  '(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=(light|dark)(?:;|$)/);' +
  'if(m)document.documentElement.classList.add(m[1])}catch(e){}})()';
