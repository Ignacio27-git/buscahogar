// ROADMAP 3.4 (decisión 262, D20; R9.3) — robots.txt según el interruptor de indexación. Apagado (por
// defecto): `Disallow: /` para todos. Encendido: se permite rastrear salvo la API y el POST de tema, y se
// anuncia el mapa del sitio. En Vercel se resuelve al compilar: cambiar la variable exige redesplegar.
import type { MetadataRoute } from 'next';

import { readSiteIndexing } from '@/server/env';

export default function robots(): MetadataRoute.Robots {
  const indexing = readSiteIndexing();
  if (!indexing.enabled || indexing.siteUrl === null) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/theme'] },
    sitemap: `${indexing.siteUrl}/sitemap.xml`,
  };
}
