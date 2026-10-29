// ROADMAP 3.4 (decisión 263; R10.1-R10.5, D21) — páginas legales: política de privacidad, política de
// cookies y aviso legal (LSSI-CE). En español, estáticas (sin llamadas externas ni scripts de terceros) y
// con cifras de conservación que coinciden con la retención REAL del sistema (decisiones 076, 082, 102,
// 103, 107 y 255). El texto es informativo: lo revisa el responsable, no afirma cumplimiento.
import { LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS, SIGNAL_RETENTION_DAYS } from '@buscahogar/core';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CookiesPage, { metadata as cookiesMetadata } from '../src/app/legal/cookies/page.js';
import NoticePage, { metadata as noticeMetadata } from '../src/app/legal/notice/page.js';
import PrivacyPage, { metadata as privacyMetadata } from '../src/app/legal/privacy/page.js';
import { SiteFooter } from '../src/components/site-footer.js';
import { PUBLIC_SITEMAP_PATHS } from '../src/lib/sitemap.js';
import { THEME_COOKIE_MAX_AGE_SECONDS, THEME_COOKIE_NAME } from '../src/server/theme-preference.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function render(page: () => ReactElement): { readonly html: string; readonly plain: string } {
  const html = renderToStaticMarkup(page());
  return { html, plain: text(html) };
}

const IDENTITY_ENV = {
  LEGAL_OWNER_NAME: 'Ana Pérez López',
  LEGAL_OWNER_TAX_ID: '12345678Z',
  LEGAL_OWNER_ADDRESS: 'Calle Mayor 1, 28013 Madrid',
  LEGAL_OWNER_EMAIL: 'contacto@example.test',
} as const;

function stubIdentity(): void {
  for (const [name, value] of Object.entries(IDENTITY_ENV)) {
    vi.stubEnv(name, value);
  }
}

function unsetIdentity(): void {
  for (const name of Object.keys(IDENTITY_ENV)) {
    vi.stubEnv(name, undefined);
  }
}

// Los únicos destinos externos admitidos en las tres páginas: enlaces de atribución y de reclamación.
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'www.openstreetmap.org',
  'www.aepd.es',
  'www.idealista.com',
  'www.ign.es',
  'creativecommons.org',
  'www.boe.es',
]);

function externalHrefs(html: string): string[] {
  return Array.from(html.matchAll(/href="(https?:\/\/[^"]+)"/g), (match) => match[1] ?? '');
}

describe.each([
  ['privacidad', PrivacyPage, privacyMetadata, 'Política de privacidad'],
  ['cookies', CookiesPage, cookiesMetadata, 'Política de cookies'],
  ['aviso legal', NoticePage, noticeMetadata, 'Aviso legal'],
] as const)('página %s — estructura común (R10.1, R10.5)', (_name, Page, metadata, title) => {
  it('tiene un único h1 con el título y el título de la pestaña lo repite', () => {
    const { html } = render(Page);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(text(html.slice(html.indexOf('<h1'), html.indexOf('</h1>')))).toBe(title);
    expect(metadata.title).toBe(title);
  });

  it('no incluye scripts, recursos externos incrustados ni formularios', () => {
    const { html } = render(Page);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<form');
    expect(html).not.toMatch(/\ssrc=/);
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<img');
  });

  it('solo enlaza fuera del sitio a destinos de atribución o de reclamación conocidos', () => {
    const { html } = render(Page);
    for (const href of externalHrefs(html)) {
      expect(ALLOWED_EXTERNAL_HOSTS.has(new URL(href).host)).toBe(true);
    }
  });

  it('el texto de la interfaz va en español y en tuteo, sin voz impersonal de error', () => {
    const { plain } = render(Page);
    expect(plain).not.toMatch(/\bSe (ha|han) producido\b/);
    expect(plain).not.toMatch(/\bundefined\b|\bnull\b|\[object/);
  });
});

describe('política de privacidad (R10.2)', () => {
  it('describe la huella HMAC de la IP y que la dirección no se guarda', () => {
    const { plain } = render(PrivacyPage);
    expect(plain).toContain('HMAC-SHA256');
    expect(plain).toContain('No guardamos tu dirección IP');
    expect(plain).toMatch(/clave secreta/);
  });

  it('declara que no hay analítica, publicidad, cuentas ni perfiles', () => {
    const { plain } = render(PrivacyPage);
    expect(plain).toContain('No usamos analítica');
    expect(plain).toMatch(/publicidad/);
    expect(plain).toMatch(/no hay cuentas/i);
  });

  it('indica la conservación de cada categoría con las cifras reales del sistema', () => {
    const { plain } = render(PrivacyPage);
    // Señales de demanda por zona: 180 días (decisión 103), sin identificador de la persona.
    expect(SIGNAL_RETENTION_DAYS).toBe(180);
    expect(plain).toMatch(/zona y día[^.]*180 días/);
    expect(plain).toMatch(/sin ningún identificador/);
    // Anuncios retirados: redacción a los 180 días de inactividad (decisión 107).
    expect(LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS).toBe(180);
    expect(plain).toMatch(/180 días inactivo/);
    // Cuota diaria de cobertura: el día UTC en curso, borrado después (decisiones 076 y 082).
    expect(plain).toMatch(/día natural \(UTC\)/);
    // Limitador de peticiones: ventana corta, borrado perezoso de lo vencido (decisión 255).
    expect(plain).toMatch(/ventana de limitación/);
    expect(plain).toMatch(/de forma perezosa/);
    // Cookie de tema: un año.
    expect(THEME_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(plain).toMatch(/cookie `?theme`? [^.]*un año/i);
    // Copias de seguridad: 7 diarias, 4 semanales y 3 mensuales (decisión de copias, R8.2).
    expect(plain).toMatch(/7 diarias, 4 semanales y 3 mensuales/);
  });

  it('nombra al proveedor de teselas, que recibe la IP del navegador, y enlaza su copyright', () => {
    const { html, plain } = render(PrivacyPage);
    expect(plain).toMatch(/OpenStreetMap/);
    expect(plain).toMatch(/recibe la dirección IP/);
    expect(externalHrefs(html)).toContain('https://www.openstreetmap.org/copyright');
  });

  it('con un proveedor de teselas propio nombra su atribución en lugar de OpenStreetMap', () => {
    vi.stubEnv('TILE_URL_TEMPLATE', 'https://tiles.example.test/{z}/{x}/{y}.png?key=pub');
    vi.stubEnv('TILE_ATTRIBUTION', 'Mapas Ejemplo');
    const { html, plain } = render(PrivacyPage);
    expect(plain).toContain('Mapas Ejemplo');
    expect(plain).toContain('tiles.example.test');
    expect(plain).not.toContain('key=pub');
    expect(html).not.toContain('key=pub');
    expect(externalHrefs(html)).not.toContain('https://www.openstreetmap.org/copyright');
  });

  it('explica los derechos, la vía de contacto y la reclamación ante la AEPD', () => {
    const { html, plain } = render(PrivacyPage);
    for (const right of [
      'acceso',
      'rectificación',
      'supresión',
      'oposición',
      'limitación',
      'portabilidad',
    ]) {
      expect(plain).toContain(right);
    }
    expect(externalHrefs(html)).toContain('https://www.aepd.es');
  });

  it('cita las fuentes de datos con enlace de vuelta y la licencia del IGN/CNIG', () => {
    const { html, plain } = render(PrivacyPage);
    expect(plain).toContain('Idealista');
    expect(plain).toContain('CC-BY 4.0');
    expect(plain).toMatch(/enlace al anuncio original/);
    expect(externalHrefs(html)).toContain('https://www.idealista.com');
  });

  it('identifica al responsable con la configuración y enlaza el aviso legal', () => {
    stubIdentity();
    const { html, plain } = render(PrivacyPage);
    expect(plain).toContain('Ana Pérez López');
    expect(plain).toContain('contacto@example.test');
    expect(html).toContain('href="/legal/notice"');
    expect(html).toContain('href="/legal/cookies"');
  });

  it('sin configurar muestra marcadores visibles y no inventa una identidad', () => {
    unsetIdentity();
    const { plain } = render(PrivacyPage);
    expect(plain).toContain('[Pendiente de configurar: nombre o razón social del titular]');
    expect(plain).toContain('[Pendiente de configurar: correo electrónico de contacto]');
    expect(plain).not.toContain('Ana Pérez López');
  });

  it('no afirma cumplimiento normativo', () => {
    const { plain } = render(PrivacyPage);
    expect(plain).not.toMatch(/cumpl\w+ (con )?(el )?(RGPD|LOPDGDD|LSSI)/i);
    expect(plain).not.toMatch(/100 ?% (seguro|legal)/i);
  });
});

describe('política de cookies (R10.3)', () => {
  it('lista exactamente una cookie, theme, con su finalidad, duración y atributos reales', () => {
    const { html, plain } = render(CookiesPage);
    expect(THEME_COOKIE_NAME).toBe('theme');
    expect(html.match(/<dl[ >]/g)).toHaveLength(1);
    expect(html.match(/<dt[ >]/g)).toHaveLength(4);
    expect(plain).toContain('theme');
    expect(plain).toMatch(/Duración 1 año/);
    expect(plain).toMatch(/SameSite=Lax/);
    expect(plain).toMatch(/Funcional/);
    expect(plain).toMatch(/Secure/);
  });

  it('declara que no hay cookies de analítica, publicidad ni de terceros', () => {
    const { plain } = render(CookiesPage);
    expect(plain).toContain('No usamos cookies de analítica, publicidad ni de terceros');
  });

  it('explica cuándo se crea y cómo se borra', () => {
    const { plain } = render(CookiesPage);
    expect(plain).toMatch(/Solo se crea si eliges Claro u Oscuro/);
    expect(plain).toMatch(/«Sistema» la borra/);
  });

  it('enlaza la política de privacidad', () => {
    const { html } = render(CookiesPage);
    expect(html).toContain('href="/legal/privacy"');
  });
});

describe('aviso legal (R10.4)', () => {
  it('con la identidad configurada muestra titular, NIF, domicilio y correo', () => {
    stubIdentity();
    const { plain } = render(NoticePage);
    expect(plain).toContain('Ana Pérez López');
    expect(plain).toContain('12345678Z');
    expect(plain).toContain('Calle Mayor 1, 28013 Madrid');
    expect(plain).toContain('contacto@example.test');
    expect(plain).not.toContain('Pendiente de configurar');
  });

  it('sin configurar muestra cuatro marcadores visibles', () => {
    unsetIdentity();
    const { plain } = render(NoticePage);
    expect(plain.match(/\[Pendiente de configurar:/g)).toHaveLength(4);
  });

  it('una identidad parcial mezcla datos reales y marcadores sin sustituir unos por otros', () => {
    unsetIdentity();
    vi.stubEnv('LEGAL_OWNER_NAME', 'Ana Pérez López');
    const { plain } = render(NoticePage);
    expect(plain).toContain('Ana Pérez López');
    expect(plain.match(/\[Pendiente de configurar:/g)).toHaveLength(3);
  });

  it('cita la LSSI-CE y aclara que los anuncios son de terceros', () => {
    const { html, plain } = render(NoticePage);
    expect(plain).toContain('Ley 34/2002');
    expect(plain).toMatch(/Los anuncios los publican terceros/);
    expect(externalHrefs(html)).toContain('https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758');
  });

  it('enlaza las políticas de privacidad y de cookies', () => {
    const { html } = render(NoticePage);
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain('href="/legal/cookies"');
  });
});

describe('el mapa del sitio resuelve las tres páginas legales (S2 → S3)', () => {
  const legalPaths = PUBLIC_SITEMAP_PATHS.filter((path) => path.startsWith('/legal/'));

  it('cada ruta legal del mapa del sitio tiene su página', () => {
    expect(legalPaths).toEqual(['/legal/privacy', '/legal/cookies', '/legal/notice']);
    for (const path of legalPaths) {
      expect(
        existsSync(fileURLToPath(new URL(`../src/app${path}/page.tsx`, import.meta.url)))
      ).toBe(true);
    }
  });

  it('el pie enlaza exactamente las mismas rutas legales que el mapa del sitio', () => {
    const footer = renderToStaticMarkup(<SiteFooter />);
    const linked = Array.from(footer.matchAll(/href="(\/legal\/[^"]+)"/g), (match) => match[1]);
    expect(linked.toSorted()).toEqual(legalPaths.toSorted());
  });
});
