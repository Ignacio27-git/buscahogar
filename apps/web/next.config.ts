import type { NextConfig } from 'next';

// ROADMAP 1.15 (security-hardening, spec #261 "http-security-headers",
// diseño decisión 080) — CSP ESTÁTICA ("Without Nonces", guía oficial de
// Next.js: `docs/app/guides/content-security-policy.md`, sección "Without
// Nonces" — sin nonces no hace falta forzar renderizado dinámico en cada
// página). `isDev` se recibe como parámetro, calculado DENTRO de
// `headers()` (invocada de nuevo en cada build/petición, nunca cacheada al
// cargar el módulo) — así un test puede mutar NODE_ENV con `vi.stubEnv` y
// observar el cambio sin reimportar el módulo.
function buildContentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // spec #261 "csp-image-policy" / diseño decisión 080: las imágenes de
    // fuentes externas pasan siempre por el mismo origen vía `/_next/image`
    // (`images.remotePatterns` de abajo, ROADMAP 1.11), nunca directamente
    // desde el navegador. ROADMAP 2.6 (decisión 112, enmienda la 080): UNA
    // única excepción, el host de las teselas raster de OpenStreetMap, que el
    // navegador pide directamente (el servidor nunca las proxea). Sin
    // `connect-src`, sin comodines y sin otros hosts.
    "img-src 'self' blob: data: https://tile.openstreetmap.org",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // decisión 080: en desarrollo casi siempre se sirve por HTTP — forzar
  // HTTPS ahí rompería el propio servidor de desarrollo local.
  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

const nextConfig: NextConfig = {
  // spec #261 "Every Page Response Carries A Static CSP And The OWASP
  // Header Set; No X-Powered-By": nunca revelar el framework servidor en
  // un header de respuesta.
  poweredByHeader: false,
  // Imágenes remotas: los dominios de las fuentes se añadirán aquí (paso 1.11).
  // Las credenciales de las fuentes NUNCA llegan a este workspace: viven solo
  // en apps/ingestion y jamás en variables NEXT_PUBLIC_*.
  images: {
    // ROADMAP 1.11 (diseño D8) — un único dominio, el observado en las 100
    // fixtures reales de ingesta (paso 1.5/1.6). El hostname es la frontera
    // de seguridad real (decide a qué servidor proxeamos); el `pathname`
    // observado (`/blur/…`) no se fija, porque pinnar una forma de ruta no
    // observada por contrato sería la misma clase de suposición que un
    // hostname con comodín, en sentido contrario.
    remotePatterns: [{ protocol: 'https', hostname: 'img4.idealista.com' }],
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(isDev) },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
          // Superseded por `frame-ancestors` de la CSP de arriba en
          // navegadores modernos (guía oficial de Next.js); se declara
          // IGUAL, por compatibilidad con navegadores que todavía no
          // soportan `frame-ancestors`.
          { key: 'X-Frame-Options', value: 'DENY' },
          // decisión 080/spec #261: COOP y CORP SÍ, COEP NUNCA — COEP
          // rompería `img4.idealista.com` (no declara
          // Cross-Origin-Resource-Policy en el otro extremo).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
