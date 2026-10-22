// ROADMAP 3.4 (decisión 262, D20; R9.3) — GET /sitemap.xml. Apagado (por defecto): 404, no un 200 vacío
// (un mapa del sitio vacío anunciaría una web sin páginas). Encendido: XML con las páginas públicas.
// Es un manejador de ruta (no `sitemap.ts`) precisamente para poder devolver 404. Sin APIs dinámicas, se
// resuelve al compilar: cambiar `SITE_INDEXING` exige redesplegar.
import { buildSitemapXml, PUBLIC_SITEMAP_PATHS } from '@/lib/sitemap';
import { readSiteIndexing } from '@/server/env';

export function GET(): Response {
  const indexing = readSiteIndexing();
  if (!indexing.enabled || indexing.siteUrl === null) {
    return new Response(null, { status: 404 });
  }
  return new Response(buildSitemapXml(indexing.siteUrl, PUBLIC_SITEMAP_PATHS), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
