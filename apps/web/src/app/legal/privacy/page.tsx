// ROADMAP 3.4 (decisión 263; R10.2, D21) — política de privacidad. Estática: sin llamadas externas ni
// scripts de terceros. Cada cifra de conservación sale de la retención REAL del sistema (decisiones 076,
// 082, 102, 103, 107 y 255); las de `packages/core` se importan para que el texto no pueda divergir del
// código. Texto informativo: lo revisa el responsable, no afirma cumplimiento normativo.
// Enlaces normales (convención de la app): `next/link` añadiría JavaScript de cliente.
import { LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS, SIGNAL_RETENTION_DAYS } from '@buscahogar/core';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { LegalFacts, LegalValue } from '@/components/legal-facts';
import { TileAttribution } from '@/components/tile-attribution';
import { readLegalIdentity } from '@/server/legal-identity';
import { readTileConfig } from '@/server/env';

export const metadata: Metadata = { title: 'Política de privacidad' };

const IGN_HREF = 'https://www.ign.es';
const CC_BY_HREF = 'https://creativecommons.org/licenses/by/4.0/deed.es';
const AEPD_HREF = 'https://www.aepd.es';

export default function PrivacyPage(): ReactElement {
  const identity = readLegalIdentity();
  const tiles = readTileConfig();
  const tileHost = new URL(tiles.imgSrcOrigin).host;

  return (
    <article className="legal-page">
      <h1>Política de privacidad</h1>
      <p className="legal-page__lead">
        Esta página explica qué datos trata Buscahogar cuando lo usas, para qué y durante cuánto
        tiempo. No hay cuentas de usuario ni inicio de sesión: no te pedimos nombre, correo ni
        contraseña.
      </p>

      <section>
        <h2>Quién es el responsable</h2>
        <LegalFacts
          facts={[
            { label: 'Titular', value: <LegalValue field={identity.name} /> },
            { label: 'Correo de contacto', value: <LegalValue field={identity.email} mailto /> },
          ]}
        />
        <p>
          Los datos completos del titular están en el <a href="/legal/notice">aviso legal</a>.
        </p>
      </section>

      <section>
        <h2>Qué datos tratamos y cuánto tiempo los conservamos</h2>

        <h3>Huella de tu dirección IP</h3>
        <p>
          No guardamos tu dirección IP. Para limitar el abuso, el servidor la transforma en una
          huella con HMAC-SHA256 y una clave secreta que solo conoce el responsable, y guarda
          únicamente esa huella. Sin la clave no se puede recuperar la dirección a partir de la
          huella; con la clave sí se puede comprobar si una dirección concreta coincide, así que la
          huella sigue siendo un dato personal seudonimizado. Se usa en dos contadores:
        </p>
        <ul>
          <li>
            <strong>Limitador de peticiones.</strong> Cuenta las peticiones de una huella dentro de
            una ventana de limitación corta, cuya duración fija la configuración del servicio. Las
            filas vencidas se borran de forma perezosa, al atender peticiones posteriores y con un
            máximo de cien por petición: con muy poco tráfico, una fila vencida puede permanecer
            hasta que lleguen más peticiones.
          </li>
          <li>
            <strong>Cuota diaria de cobertura.</strong> Cuenta cuántos municipios nuevos pide cubrir
            una huella en un día natural (UTC). Se conserva durante ese día; las filas de los días
            ya cerrados se borran en el siguiente uso de la cuota y en cada ciclo del proceso
            programado que actualiza los anuncios.
          </li>
        </ul>

        <h3>Zonas consultadas</h3>
        <p>
          Cuando buscas en un municipio o en una zona, anotamos que esa zona se ha consultado ese
          día, para decidir qué zonas conviene mantener actualizadas. Guardamos como mucho una
          anotación por zona y día, durante {SIGNAL_RETENTION_DAYS} días, sin ningún identificador
          de la persona que consultó: ni IP, ni huella, ni cookie. Los filtros de tu búsqueda viven
          en la dirección de la página; no los guardamos en una cuenta ni en un historial.
        </p>

        <h3>Preferencia de tema</h3>
        <p>
          Si eliges el tema claro u oscuro, guardamos esa elección en una cookie <code>theme</code>{' '}
          que se conserva un año. Los detalles están en la{' '}
          <a href="/legal/cookies">política de cookies</a>.
        </p>

        <h3>Datos de los anuncios</h3>
        <p>
          Los anuncios proceden de fuentes externas. No son datos tuyos, pero pueden contener datos
          personales de quien anuncia, por ejemplo en la descripción. Cuando un anuncio lleva{' '}
          {LISTING_TOMBSTONE_AFTER_INACTIVE_DAYS} días inactivo, borramos su descripción, los datos
          originales de la fuente y la miniatura; conservamos el precio y los campos estructurados,
          como la superficie o las habitaciones, para el histórico de precios.
        </p>

        <h3>Registros técnicos del alojamiento</h3>
        <p>
          El proveedor que aloja el sitio puede registrar datos técnicos de cada petición, como la
          dirección IP y la dirección solicitada, para operar el servicio y protegerlo. Esos
          registros los gestiona el proveedor y su plazo de conservación depende de sus condiciones.
        </p>

        <h3>Copias de seguridad</h3>
        <p>
          La base de datos se copia cada día en copias cifradas. Se conservan 7 diarias, 4 semanales
          y 3 mensuales, y las más antiguas se eliminan. Un dato borrado de la base de datos puede
          seguir en las copias que lo contienen hasta que estas se eliminen.
        </p>
      </section>

      <section>
        <h2>Para qué usamos los datos</h2>
        <ul>
          <li>
            Limitar el abuso y proteger el servicio y las cuotas de las fuentes. Base jurídica:
            interés legítimo del responsable (artículo 6.1.f del RGPD).
          </li>
          <li>
            Decidir qué zonas se mantienen actualizadas, sin identificar a nadie. Base jurídica:
            interés legítimo del responsable.
          </li>
          <li>Recordar el tema que has elegido, una función que pides al usarla.</li>
        </ul>
        <p>
          No usamos analítica, no mostramos publicidad, no elaboramos perfiles y no vendemos ni
          cedemos datos a terceros.
        </p>
      </section>

      <section>
        <h2>Con quién se comparten</h2>
        <p>
          Para publicar el sitio usamos un proveedor de alojamiento web y un proveedor de base de
          datos gestionada. Ambos tratan datos por nuestra cuenta, como encargados del tratamiento.
        </p>
        <p>
          Las teselas del mapa no pasan por nuestro servidor: tu navegador las pide directamente a{' '}
          {tileHost}. El proveedor del mapa, <TileAttribution attribution={tiles.attribution} />,
          recibe la dirección IP de tu navegador y los datos técnicos de cada petición, y los trata
          según su propia política. Las fotos de los anuncios llegan a través de nuestro servidor,
          no directamente desde las fuentes: tu navegador solo contacta con una fuente cuando sigues
          el enlace a su anuncio. No cargamos scripts, fuentes tipográficas ni otros recursos de
          terceros.
        </p>
      </section>

      <section>
        <h2>Tus derechos</h2>
        <p>
          Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del
          tratamiento y portabilidad escribiendo al correo de contacto de esta página. Como solo
          guardamos huellas, para localizar tus datos necesitaremos que nos indiques la dirección IP
          desde la que accediste: calcularemos su huella y buscaremos coincidencias.
        </p>
        <p>
          Si crees que tus datos se tratan de forma indebida, puedes reclamar ante la{' '}
          <a href={AEPD_HREF}>Agencia Española de Protección de Datos (AEPD)</a>.
        </p>
      </section>

      <section>
        <h2>Fuentes de los datos</h2>
        <ul>
          <li>
            <strong>Anuncios.</strong> Proceden de portales inmobiliarios. Hoy la única fuente es{' '}
            <a href="https://www.idealista.com">Idealista</a>. Cada vivienda incluye el enlace al
            anuncio original en su fuente.
          </li>
          <li>
            <strong>Municipios y entidades de población.</strong> Nomenclátor Geográfico de
            Municipios y Entidades de Población (NGMEP) del{' '}
            <a href={IGN_HREF}>Instituto Geográfico Nacional (IGN)</a> y el Centro Nacional de
            Información Geográfica (CNIG), bajo licencia <a href={CC_BY_HREF}>CC-BY 4.0</a>.
          </li>
          <li>
            <strong>Mapa.</strong> <TileAttribution attribution={tiles.attribution} />
          </li>
        </ul>
      </section>
    </article>
  );
}
