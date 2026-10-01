// Paso D.1a (spec e2e-test-database R1; diseño A3, decisión 135) — guard de la
// base de datos e2e. Módulo PURO: sin `pg`, sin drizzle, sin leer `process.env`
// (recibe todo por parámetro). Va en el barril público `./e2e` precisamente
// porque no abre ninguna conexión: el seed lo ejecuta ANTES de crear un Pool.
//
// Patrón copiado del guard `_bench` de `apps/ingestion` (decisión 135: no se
// parametriza ese guard porque editaría ingestion y cruzaría la frontera
// web/ingestion).

export class E2eGuardError extends Error {}

// Nombre de base de datos e2e: minúsculas, dígitos y guion bajo, terminado en
// `_e2e`. Es además un identificador seguro: el seed lo interpola entre
// comillas en `DROP DATABASE`/`CREATE DATABASE`, que no admiten parámetros.
const E2E_DATABASE_NAME = /^[a-z0-9_]+_e2e$/;

// Único rol que el servidor web e2e puede usar (decisión 056).
const WEB_ROLE = 'web_readonly';

// Base de mantenimiento desde la que se hace DROP/CREATE de la base e2e.
const MAINTENANCE_DATABASE = 'postgres';

interface ParsedDatabaseUrl {
  readonly user: string;
  readonly host: string;
  readonly port: string;
  readonly database: string;
}

function parseUrl(raw: string | undefined, label: string): ParsedDatabaseUrl {
  if (raw === undefined || raw === '') {
    throw new E2eGuardError(
      `${label} no está definida: el e2e necesita una URL explícita, nunca un valor por defecto.`
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Nunca se incluye `raw` en el mensaje: puede llevar la contraseña.
    throw new E2eGuardError(`${label} no es una URL de conexión legible.`);
  }
  return {
    user: decodeURIComponent(parsed.username),
    host: parsed.hostname,
    port: parsed.port === '' ? '5432' : parsed.port,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
}

function assertE2eName(database: string, label: string): void {
  if (!E2E_DATABASE_NAME.test(database)) {
    throw new E2eGuardError(
      `${label} apunta a la base de datos "${database}", que no cumple ${E2E_DATABASE_NAME.source}: ` +
        'el guard solo admite bases desechables marcadas con el sufijo _e2e.'
    );
  }
}

// Valida la URL del PROPIETARIO (la que hace DROP/CREATE). `forbiddenUrls` son
// las URL de las demás credenciales (DATABASE_URL, WEB_DATABASE_URL): una URL
// idéntica a cualquiera de ellas se rechaza aunque su base termine en `_e2e`.
export function assertE2eOwnerDatabaseUrl(
  url: string | undefined,
  devDatabaseName: string | undefined,
  forbiddenUrls: readonly (string | undefined)[] = []
): asserts url is string {
  const target = parseUrl(url, 'E2E_DATABASE_URL');
  assertE2eName(target.database, 'E2E_DATABASE_URL');

  if (
    devDatabaseName !== undefined &&
    devDatabaseName !== '' &&
    target.database === devDatabaseName
  ) {
    throw new E2eGuardError(
      `E2E_DATABASE_URL coincide con la base de desarrollo "${devDatabaseName}": rechazado por seguridad.`
    );
  }

  if (
    forbiddenUrls.some(
      (forbidden) => forbidden !== undefined && forbidden !== '' && forbidden === url
    )
  ) {
    throw new E2eGuardError(
      'E2E_DATABASE_URL es idéntica a otra URL de conexión del entorno (DATABASE_URL o WEB_DATABASE_URL): rechazado.'
    );
  }
}

// Valida la URL de SOLO LECTURA que recibe el proceso de Next: base `_e2e`,
// usuario `web_readonly` y, si se conoce la del propietario, mismo
// host/puerto/base y credencial distinta.
export function assertE2eWebDatabaseUrl(
  url: string | undefined,
  ownerUrl?: string
): asserts url is string {
  const web = parseUrl(url, 'E2E_WEB_DATABASE_URL');
  assertE2eName(web.database, 'E2E_WEB_DATABASE_URL');

  if (web.user !== WEB_ROLE) {
    throw new E2eGuardError(
      `E2E_WEB_DATABASE_URL usa el rol "${web.user}": el servidor web e2e solo puede usar ${WEB_ROLE}.`
    );
  }

  if (ownerUrl === undefined) {
    return;
  }
  const owner = parseUrl(ownerUrl, 'E2E_DATABASE_URL');
  if (owner.host !== web.host || owner.port !== web.port || owner.database !== web.database) {
    throw new E2eGuardError(
      'E2E_WEB_DATABASE_URL y E2E_DATABASE_URL deben apuntar al mismo host, puerto y base.'
    );
  }
  if (owner.user === web.user) {
    throw new E2eGuardError('E2E_WEB_DATABASE_URL y E2E_DATABASE_URL no pueden usar el mismo rol.');
  }
}

// URL de mantenimiento: la del propietario con la base `postgres`, para poder
// borrar y crear la base e2e sin estar conectado a ella.
export function maintenanceUrl(ownerUrl: string): string {
  const parsed = new URL(ownerUrl);
  parsed.pathname = `/${MAINTENANCE_DATABASE}`;
  return parsed.toString();
}
