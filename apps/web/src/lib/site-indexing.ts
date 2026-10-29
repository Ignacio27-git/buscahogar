// ROADMAP 3.4 (decisión 262, D20; R9.3, PD7) — interruptor de indexación. `SITE_INDEXING` (apagado por
// defecto) y `SITE_URL` (origen público, sin ruta). Apagado: robots `Disallow: /`, `noindex, nofollow` en
// las páginas y `/sitemap.xml` con 404. Encendido: se permite el rastreo y el mapa del sitio expone las
// páginas públicas, con URLs absolutas (de ahí que `SITE_URL` sea obligatoria al encenderlo).
//
// Cuándo se evalúa: en Vercel, `robots.ts`, el mapa del sitio y los metadatos se resuelven al COMPILAR,
// así que cambiar estas variables exige un nuevo despliegue.
import { z } from 'zod';

export interface SiteIndexing {
  readonly enabled: boolean;
  // Origen sin barra final; null si no se definió (solo posible con la indexación apagada).
  readonly siteUrl: string | null;
}

// Solo se leen `SITE_INDEXING` y `SITE_URL`; el tipo admite `process.env` tal cual.
export type SiteIndexingEnv = Readonly<Record<string, string | undefined>>;

export class InvalidSiteIndexingError extends Error {}

const indexingSchema = z.enum(['true', 'false']);

// Solo un origen: http(s), sin credenciales, ruta, consulta ni fragmento.
const siteUrlSchema = z
  .string()
  .transform((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'no es una URL' });
      return z.NEVER;
    }
    const isOriginOnly =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '';
    if (!isOriginOnly) {
      context.addIssue({ code: 'custom', message: 'debe ser solo un origen http(s)' });
      return z.NEVER;
    }
    return url.origin;
  });

export function parseSiteIndexing(env: SiteIndexingEnv): SiteIndexing {
  const rawIndexing = env.SITE_INDEXING === undefined || env.SITE_INDEXING === '' ? 'false' : env.SITE_INDEXING;
  const indexing = indexingSchema.safeParse(rawIndexing);
  if (!indexing.success) {
    throw new InvalidSiteIndexingError(
      'SITE_INDEXING debe ser "true" o "false" (apagado si no se define; docs/DECISIONS.md, decisión 262).'
    );
  }
  const enabled = indexing.data === 'true';

  let siteUrl: string | null = null;
  if (env.SITE_URL !== undefined && env.SITE_URL !== '') {
    const parsed = siteUrlSchema.safeParse(env.SITE_URL);
    if (!parsed.success) {
      throw new InvalidSiteIndexingError(
        'SITE_URL debe ser solo un origen http(s), sin credenciales, ruta, consulta ni fragmento ' +
          '(docs/DECISIONS.md, decisión 262).'
      );
    }
    siteUrl = parsed.data;
  }
  if (enabled && siteUrl === null) {
    throw new InvalidSiteIndexingError(
      'SITE_INDEXING=true exige SITE_URL: el mapa del sitio lleva URLs absolutas (docs/DECISIONS.md, decisión 262).'
    );
  }
  return { enabled, siteUrl };
}
