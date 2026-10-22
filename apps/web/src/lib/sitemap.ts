// ROADMAP 3.4 (decisión 262, D20; R9.3) — mapa del sitio puro. El contenido fino (fichas, zonas) queda
// fuera de alcance: solo las páginas públicas estáticas.

// Las tres rutas legales son las páginas de `app/legal/*` (paso S3, decisión 263).
export const PUBLIC_SITEMAP_PATHS: readonly string[] = ['/', '/legal/privacy', '/legal/cookies', '/legal/notice'];

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// `siteUrl` es un origen sin barra final (lo garantiza `parseSiteIndexing`); cada ruta empieza por `/`.
export function buildSitemapXml(siteUrl: string, paths: readonly string[]): string {
  const entries = paths.map((path) => `  <url><loc>${escapeXml(`${siteUrl}${path}`)}</loc></url>\n`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries +
    '</urlset>\n'
  );
}
