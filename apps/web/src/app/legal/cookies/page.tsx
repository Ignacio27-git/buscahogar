// ROADMAP 3.4 (decisión 263; R10.3, D21) — política de cookies. La aplicación guarda UNA sola cookie,
// `theme` (decisión 146): una preferencia de presentación, no una sesión. Los atributos salen de
// `buildThemeCookie` (Path=/, SameSite=Lax, Max-Age de un año, Secure bajo HTTPS) y los fija el test
// `legal-pages.test.tsx`; `cookie-allowlist.test.ts` falla si el código fija alguna otra. Texto
// informativo: lo revisa el responsable.
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { LegalFacts } from '@/components/legal-facts';
import { THEME_COOKIE_NAME } from '@/server/theme-preference';

export const metadata: Metadata = { title: 'Política de cookies' };

export default function CookiesPage(): ReactElement {
  return (
    <article className="legal-page">
      <h1>Política de cookies</h1>
      <p className="legal-page__lead">
        Una cookie es un pequeño archivo que un sitio guarda en tu navegador. Buscahogar usa una
        sola, para recordar el tema que has elegido.
      </p>

      <section>
        <h2>La cookie que usamos</h2>
        <LegalFacts
          facts={[
            { label: 'Nombre', value: <code>{THEME_COOKIE_NAME}</code> },
            {
              label: 'Finalidad',
              value: 'Funcional. Recuerda tu elección de tema claro u oscuro.',
            },
            { label: 'Duración', value: '1 año' },
            {
              label: 'Atributos',
              value:
                'Path=/ y SameSite=Lax; Secure cuando entras por HTTPS. No es HttpOnly: la lee un pequeño script de ' +
                'la cabecera para aplicar el tema antes de pintar la página.',
            },
          ]}
        />
        <p>
          Solo se crea si eliges Claro u Oscuro en el selector de la cabecera. Elegir «Sistema» la
          borra, y el sitio vuelve a seguir el tema de tu dispositivo. También puedes borrarla desde
          los ajustes de tu navegador.
        </p>
      </section>

      <section>
        <h2>Lo que no usamos</h2>
        <p>
          No usamos cookies de analítica, publicidad ni de terceros, y no guardamos datos en el
          almacenamiento local de tu navegador. La cookie <code>theme</code> solo guarda una
          preferencia de presentación: el servidor no la lee, y no hay cuentas ni sesiones.
        </p>
        <p>
          El resto de los datos que tratamos está en la{' '}
          <a href="/legal/privacy">política de privacidad</a>.
        </p>
      </section>
    </article>
  );
}
