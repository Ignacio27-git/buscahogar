// ROADMAP 3.4 (decisión 263 parte C; D22; R12.1) — inventario de las variables de entorno de apps/web. Es la
// FUENTE de la tabla de `docs/DEPLOYMENT.md` (sección «Web»): `test/deployment-docs.test.ts` falla si la tabla y
// este inventario divergen en nombres, obligatoriedad, valor por defecto o tipo de URL.
//
// Solo describe; la validación real vive en los lectores (`server/env.ts`, `lib/tile-config.ts`,
// `lib/site-indexing.ts`, `server/legal-identity.ts`) y el clasificador (`server/env-classifier.ts`) la reutiliza.
// Los ejemplos NO son secretos reales. Ninguna variable de esta lista es `NEXT_PUBLIC_*`.
export type EnvRequired = 'sí' | 'no' | 'condicional';
export type EnvConnection = 'pooler' | 'directa' | '—';

export interface EnvVarSpec {
  readonly name: string;
  readonly required: EnvRequired;
  // Texto exacto de la celda «Por defecto» de la tabla; «—» si no hay valor por defecto.
  readonly defaultValue: string;
  readonly example: string;
  // Tipo de URL de base de datos (pooler o directa); «—» si no es una URL de base de datos.
  readonly connection: EnvConnection;
  readonly description: string;
}

// Título (sin `###`) de la sección de `docs/DEPLOYMENT.md` que contiene la tabla de esta app.
export const WEB_ENV_DOCS_HEADING = 'Web (`apps/web`)';

export const WEB_ENV_MANIFEST: readonly EnvVarSpec[] = [
  {
    name: 'DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: 'postgresql://web_readonly:<secreto>@<host>-pooler/<base>?sslmode=verify-full',
    connection: 'pooler',
    description: 'Rol `web_readonly` (solo lectura). En Compose llega desde `WEB_DATABASE_URL`.',
  },
  {
    name: 'WEB_COVERAGE_DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: 'postgresql://web_coverage:<secreto>@<host>-pooler/<base>?sslmode=verify-full',
    connection: 'pooler',
    description: 'Rol `web_coverage`: `coverage_jobs`, `coverage_client_quota`, `zone_query_signals` y `proxy_rate_limit` (limitador).',
  },
  {
    name: 'NEW_ZONES_DAILY_CAP',
    required: 'sí',
    defaultValue: '—',
    example: '20',
    connection: '—',
    description: 'Tope de zonas nuevas por día (decisión de operación, nunca inventada en código).',
  },
  {
    name: 'CLIENT_IP_HEADER',
    required: 'no',
    defaultValue: '— (limitadores desactivados)',
    example: 'x-forwarded-for',
    connection: '—',
    description: 'Cabecera de confianza con la IP del cliente. En Vercel, `x-forwarded-for`. Definida, exige las cuatro siguientes.',
  },
  {
    name: 'CLIENT_IP_HMAC_KEY',
    required: 'condicional',
    defaultValue: '—',
    example: '<32 o más caracteres aleatorios>',
    connection: '—',
    description: 'Clave del HMAC-SHA256 con el que se reduce la IP a una huella antes de guardar nada. Obligatoria si hay `CLIENT_IP_HEADER`.',
  },
  {
    name: 'COVERAGE_PER_CLIENT_DAILY_CAP',
    required: 'condicional',
    defaultValue: '—',
    example: '5',
    connection: '—',
    description: 'Cobertura bajo demanda por cliente y día. Obligatoria si hay `CLIENT_IP_HEADER`.',
  },
  {
    name: 'PROXY_RATE_LIMIT_MAX',
    required: 'condicional',
    defaultValue: '—',
    example: '30',
    connection: '—',
    description: 'Peticiones por ventana y cliente. Obligatoria si hay `CLIENT_IP_HEADER`.',
  },
  {
    name: 'PROXY_RATE_LIMIT_WINDOW_SECONDS',
    required: 'condicional',
    defaultValue: '—',
    example: '60',
    connection: '—',
    description: 'Duración de la ventana del limitador. Obligatoria si hay `CLIENT_IP_HEADER`.',
  },
  {
    name: 'TILE_URL_TEMPLATE',
    required: 'no',
    defaultValue: 'teselas estándar de OpenStreetMap',
    example: 'https://tiles.example.test/{z}/{x}/{y}.png?key=<clave-publicable>',
    connection: '—',
    description: 'https, un solo host, `{z}/{x}/{y}`. La clave de la consulta llega a todos los navegadores: publicable y restringida por dominio, nunca secreta.',
  },
  {
    name: 'TILE_ATTRIBUTION',
    required: 'condicional',
    defaultValue: '— (la de OpenStreetMap)',
    example: '© Proveedor de teselas',
    connection: '—',
    description: 'Texto plano. Obligatoria con `TILE_URL_TEMPLATE` propia; se rechaza con la plantilla por defecto.',
  },
  {
    name: 'SITE_INDEXING',
    required: 'no',
    defaultValue: 'false',
    example: 'true',
    connection: '—',
    description: '`true` permite el rastreo y expone `/sitemap.xml`. Se evalúa al compilar: cambiarla exige un nuevo despliegue.',
  },
  {
    name: 'SITE_URL',
    required: 'condicional',
    defaultValue: '—',
    example: 'https://buscahogar.example',
    connection: '—',
    description: 'Origen público, sin ruta. Obligatoria con `SITE_INDEXING=true`.',
  },
  {
    name: 'LEGAL_OWNER_NAME',
    required: 'no',
    defaultValue: '— (marcador «Pendiente de configurar»)',
    example: 'Nombre o razón social',
    connection: '—',
    description: 'Titular del aviso legal. Sin definir, producción avisa al arrancar.',
  },
  {
    name: 'LEGAL_OWNER_TAX_ID',
    required: 'no',
    defaultValue: '— (marcador «Pendiente de configurar»)',
    example: 'NIF o CIF',
    connection: '—',
    description: 'NIF o CIF del titular.',
  },
  {
    name: 'LEGAL_OWNER_ADDRESS',
    required: 'no',
    defaultValue: '— (marcador «Pendiente de configurar»)',
    example: 'Calle y número, código postal, ciudad',
    connection: '—',
    description: 'Domicilio del titular.',
  },
  {
    name: 'LEGAL_OWNER_EMAIL',
    required: 'no',
    defaultValue: '— (marcador «Pendiente de configurar»)',
    example: 'contacto@example.test',
    connection: '—',
    description: 'Correo de contacto del titular.',
  },
];
