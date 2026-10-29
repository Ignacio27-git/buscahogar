// ROADMAP 3.4 (decisión 263 parte C; D22; R12.1) — inventario de las variables de entorno de apps/ingestion y
// de las herramientas de operación que dependen de ella. Es la FUENTE de las tablas de `docs/DEPLOYMENT.md`:
// `test/deployment-docs.test.ts` falla si una tabla y su inventario divergen en nombres, obligatoriedad, valor por
// defecto o tipo de URL. Y es la fuente de las variables OBLIGATORIAS que usa el clasificador (`env-classifier.ts`).
//
// Solo describe; la validación real vive en `readEnv` (worker), `readDeployConfig` (despliegue), `restore-verify-env`
// y los scripts de shell de `ops/backup` (que validan su propio entorno y salen con 2). Los ejemplos NO son
// secretos reales. Ninguna variable de esta lista es `NEXT_PUBLIC_*`.
export type EnvRequired = 'sí' | 'no' | 'condicional';
export type EnvConnection = 'directa' | 'pooler' | '—';
export type EnvService = 'worker' | 'deploy' | 'backup' | 'drill';

export interface EnvVarSpec {
  readonly name: string;
  readonly required: EnvRequired;
  // Texto exacto de la celda «Por defecto» de la tabla; «—» si no hay valor por defecto.
  readonly defaultValue: string;
  readonly example: string;
  readonly connection: EnvConnection;
  readonly description: string;
}

// Título (sin `###`) de la sección de `docs/DEPLOYMENT.md` con la tabla de cada servicio.
export const ENV_DOCS_HEADINGS: Readonly<Record<EnvService, string>> = {
  worker: 'Worker (`apps/ingestion`)',
  deploy: 'Despliegue (`deploy`)',
  backup: 'Copias de seguridad (`ops/backup/backup.sh`)',
  drill: 'Simulacro de restauración (`ops/backup/restore-drill.sh`)',
};

const DIRECT_URL_EXAMPLE = 'postgresql://<propietario>:<secreto>@<host-directo>/<base>?sslmode=verify-full';

const WORKER: readonly EnvVarSpec[] = [
  {
    name: 'IDEALISTA_API_KEY',
    required: 'sí',
    defaultValue: '—',
    example: '<clave de la API>',
    connection: '—',
    description: 'Credencial de la fuente. Solo existe en el worker; nunca en `apps/web`.',
  },
  {
    name: 'IDEALISTA_API_SECRET',
    required: 'sí',
    defaultValue: '—',
    example: '<secreto de la API>',
    connection: '—',
    description: 'Credencial de la fuente. Solo existe en el worker.',
  },
  {
    name: 'DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: DIRECT_URL_EXAMPLE,
    connection: 'directa',
    description: 'Base de datos del worker (rol propietario o de ingesta). Directa: el worker usa sesiones largas.',
  },
  {
    name: 'DAILY_SEARCH_CAP',
    required: 'sí',
    defaultValue: '—',
    example: '<peticiones por día>',
    connection: '—',
    description: 'Tope diario de peticiones de búsqueda. Decisión de operación: la cuota de Idealista es mensual y limitada.',
  },
  {
    name: 'BLOCKING_RADIUS_METERS',
    required: 'sí',
    defaultValue: '—',
    example: '<metros>',
    connection: '—',
    description: 'Radio del bloqueo geográfico de la deduplicación.',
  },
  {
    name: 'BLOCKING_PRICE_BAND_CENTS',
    required: 'sí',
    defaultValue: '—',
    example: '<céntimos>',
    connection: '—',
    description: 'Banda de precio del bloqueo, en céntimos.',
  },
  {
    name: 'BLOCKING_SURFACE_TOLERANCE_M2',
    required: 'sí',
    defaultValue: '—',
    example: '<m²>',
    connection: '—',
    description: 'Margen de superficie del bloqueo, en m².',
  },
  {
    name: 'POLL_INTERVAL_MS',
    required: 'no',
    defaultValue: '15000',
    example: '15000',
    connection: '—',
    description: 'Pausa entre ticks del worker.',
  },
  {
    name: 'MAX_SEARCH_REQUESTS_PER_SWEEP',
    required: 'no',
    defaultValue: '10',
    example: '10',
    connection: '—',
    description: 'Corte explícito de páginas por barrido (protege la cuota).',
  },
  {
    name: 'REFRESH_BUDGET_FRACTION',
    required: 'no',
    defaultValue: '0',
    example: '0.2',
    connection: '—',
    description: 'Fracción del tope diario que el refresco puede gastar (0 lo desactiva).',
  },
  {
    name: 'MAINTENANCE_EVERY_TICKS',
    required: 'no',
    defaultValue: '20',
    example: '20',
    connection: '—',
    description: 'Ticks entre pasadas de mantenimiento.',
  },
  {
    name: 'MAX_VERIFICATION_REQUESTS_PER_TICK',
    required: 'no',
    defaultValue: '2',
    example: '2',
    connection: '—',
    description: 'Peticiones de verificación de presencia por tick.',
  },
  {
    name: 'VERIFICATION_RADIUS_MARGIN_M',
    required: 'no',
    defaultValue: '500',
    example: '500',
    connection: '—',
    description: 'Margen (m) que la verificación suma al radio de la zona.',
  },
  {
    name: 'WORKER_STOP_GRACE_MS',
    required: 'no',
    defaultValue: '8000',
    example: '8000',
    connection: '—',
    description: 'Plazo de parada ordenada tras SIGTERM/SIGINT; al vencer, sale con 1. Debe ser menor que el plazo del host.',
  },
  {
    name: 'STALE_RUNNING_JOB_AFTER_MS',
    required: 'no',
    defaultValue: '900000',
    example: '900000',
    connection: '—',
    description: 'Antigüedad del arrendamiento a partir de la cual un job `running` se da por abandonado (mínimo 120000).',
  },
  {
    name: 'HEARTBEAT_URL',
    required: 'no',
    defaultValue: '— (sin latido; aviso de producción)',
    example: 'https://hc-ping.example/<uuid>',
    connection: '—',
    description: "URL https del dead-man's-switch. La URL es un secreto: se pide tras cada tick correcto y nunca se registra.",
  },
  {
    name: 'HEARTBEAT_MIN_INTERVAL_MS',
    required: 'no',
    defaultValue: '60000',
    example: '60000',
    connection: '—',
    description: 'Intervalo mínimo entre pings del latido (0 = uno por tick correcto).',
  },
  {
    name: 'MAX_OUTBOUND_CALLS_PER_TICK',
    required: 'no',
    defaultValue: '4',
    example: '4',
    connection: '—',
    description: 'Tope de llamadas salientes por tick; el latido y Telegram lo comparten.',
  },
  {
    name: 'TELEGRAM_BOT_TOKEN',
    required: 'no',
    defaultValue: '— (avisos desactivados; aviso de producción)',
    example: '<id>:<clave de BotFather>',
    connection: '—',
    description: 'Token del bot. Las dos variables de Telegram o ninguna.',
  },
  {
    name: 'TELEGRAM_CHAT_ID',
    required: 'no',
    defaultValue: '—',
    example: '-1001234567890',
    connection: '—',
    description: 'Chat, grupo (negativo) o `@canal` de destino. Con `TELEGRAM_BOT_TOKEN` o ninguna.',
  },
  {
    name: 'ALERT_FAILED_JOBS_THRESHOLD',
    required: 'no',
    defaultValue: '5',
    example: '5',
    connection: '—',
    description: 'Jobs fallidos en la ventana a partir de los cuales se avisa (mínimo 1).',
  },
  {
    name: 'ALERT_FAILED_JOBS_WINDOW_MS',
    required: 'no',
    defaultValue: '86400000',
    example: '86400000',
    connection: '—',
    description: 'Ventana del aviso de jobs fallidos (mínimo 60000).',
  },
  {
    name: 'ALERT_COOLDOWN_MS',
    required: 'no',
    defaultValue: '21600000',
    example: '21600000',
    connection: '—',
    description: 'Enfriamiento del aviso de jobs fallidos (mínimo 60000). Los diarios duran 24 h y los mensuales 32 días.',
  },
  {
    name: 'TELEGRAM_API_BASE_URL',
    required: 'no',
    defaultValue: '— (la API real)',
    example: 'http://127.0.0.1:8081',
    connection: '—',
    description: 'Solo para el Telegram falso de las pruebas (`scripts/fake-telegram.ts`). No se define en producción.',
  },
];

const DEPLOY: readonly EnvVarSpec[] = [
  {
    name: 'DIRECT_DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: DIRECT_URL_EXAMPLE,
    connection: 'directa',
    description: 'URL DIRECTA del propietario (migraciones, roles, DDL). Sin respaldo: nunca cae a `DATABASE_URL`.',
  },
  {
    name: 'WEB_READONLY_PASSWORD',
    required: 'sí',
    defaultValue: '—',
    example: '<secreto del rol>',
    connection: '—',
    description: 'Secreto del rol `web_readonly`. ASCII imprimible; nunca se registra.',
  },
  {
    name: 'WEB_COVERAGE_PASSWORD',
    required: 'sí',
    defaultValue: '—',
    example: '<secreto del rol>',
    connection: '—',
    description: 'Secreto del rol `web_coverage`. ASCII imprimible; nunca se registra.',
  },
  {
    name: 'WEB_READONLY_ROLE',
    required: 'no',
    defaultValue: 'web_readonly',
    example: 'web_readonly',
    connection: '—',
    description: 'Nombre del rol de solo lectura.',
  },
  {
    name: 'WEB_COVERAGE_ROLE',
    required: 'no',
    defaultValue: 'web_coverage',
    example: 'web_coverage',
    connection: '—',
    description: 'Nombre del rol de cobertura.',
  },
  {
    name: 'SEED_MONTHLY_QUOTA_TOTAL',
    required: 'no',
    defaultValue: '— (sin siembra; el worker queda cerrado)',
    example: '<cuota mensual>',
    connection: '—',
    description: 'Total mensual a sembrar SOLO si no hay ninguna fila. Con la reserva, o ninguna de las dos.',
  },
  {
    name: 'SEED_MONTHLY_QUOTA_RESERVE',
    required: 'no',
    defaultValue: '—',
    example: '<reserva>',
    connection: '—',
    description: 'Reserva de la cuota; menor que el total.',
  },
];

const BACKUP: readonly EnvVarSpec[] = [
  {
    name: 'DIRECT_DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: DIRECT_URL_EXAMPLE,
    connection: 'directa',
    description: 'URL DIRECTA de la base a copiar (nunca la del pooler).',
  },
  {
    name: 'AGE_RECIPIENT',
    required: 'sí',
    defaultValue: '—',
    example: 'age1<clave pública>',
    connection: '—',
    description: 'Clave PÚBLICA age. Una clave privada se rechaza. La privada no existe en este host.',
  },
  {
    name: 'BACKUP_S3_BUCKET',
    required: 'sí',
    defaultValue: '—',
    example: 'buscahogar-backups',
    connection: '—',
    description: 'Bucket de destino.',
  },
  {
    name: 'BACKUP_S3_ACCESS_KEY_ID',
    required: 'sí',
    defaultValue: '—',
    example: '<id de acceso>',
    connection: '—',
    description: 'Credencial S3 con escritura, listado y borrado solo en ese bucket.',
  },
  {
    name: 'BACKUP_S3_SECRET_ACCESS_KEY',
    required: 'sí',
    defaultValue: '—',
    example: '<secreto de acceso>',
    connection: '—',
    description: 'Credencial S3.',
  },
  {
    name: 'BACKUP_S3_ENDPOINT',
    required: 'no',
    defaultValue: '— (AWS S3)',
    example: 'https://<cuenta>.r2.cloudflarestorage.com',
    connection: '—',
    description: 'Endpoint S3-compatible (MinIO, R2…), con direccionamiento por ruta.',
  },
  {
    name: 'BACKUP_S3_REGION',
    required: 'no',
    defaultValue: 'us-east-1',
    example: 'eu-central-1',
    connection: '—',
    description: 'Región del almacenamiento.',
  },
  {
    name: 'BACKUP_S3_PREFIX',
    required: 'no',
    defaultValue: '—',
    example: 'produccion',
    connection: '—',
    description: '«Carpeta» dentro del bucket.',
  },
  {
    name: 'BACKUP_NAME_PREFIX',
    required: 'no',
    defaultValue: 'buscahogar',
    example: 'buscahogar',
    connection: '—',
    description: 'Prefijo del nombre de cada copia (`<prefijo>-AAAAMMDDTHHMMSSZ.dump.age`).',
  },
  {
    name: 'BACKUP_TMPDIR',
    required: 'no',
    defaultValue: '/tmp',
    example: '/tmp',
    connection: '—',
    description: 'Dónde se crea el directorio temporal (0700) del texto cifrado.',
  },
];

const DRILL: readonly EnvVarSpec[] = [
  {
    name: 'DRILL_DATABASE_URL',
    required: 'sí',
    defaultValue: '—',
    example: DIRECT_URL_EXAMPLE,
    connection: 'directa',
    description: 'Base de DESTINO, vacía y de otro servidor. Se rechaza si no está vacía o es la de `DIRECT_DATABASE_URL`.',
  },
  {
    name: 'AGE_IDENTITY_FILE',
    required: 'condicional',
    defaultValue: '—',
    example: '/run/age/id.txt',
    connection: '—',
    description: 'Ruta de la clave PRIVADA age, solo en `run`. Solo existe donde se hace el simulacro.',
  },
  {
    name: 'WEB_READONLY_PASSWORD',
    required: 'condicional',
    defaultValue: '—',
    example: '<secreto del rol>',
    connection: '—',
    description: 'Solo en `run`: con ellos el aprovisionamiento crea el rol en el destino.',
  },
  {
    name: 'WEB_COVERAGE_PASSWORD',
    required: 'condicional',
    defaultValue: '—',
    example: '<secreto del rol>',
    connection: '—',
    description: 'Solo en `run`.',
  },
  {
    name: 'WEB_READONLY_ROLE',
    required: 'no',
    defaultValue: 'web_readonly',
    example: 'web_readonly',
    connection: '—',
    description: 'Nombre del rol de solo lectura.',
  },
  {
    name: 'WEB_COVERAGE_ROLE',
    required: 'no',
    defaultValue: 'web_coverage',
    example: 'web_coverage',
    connection: '—',
    description: 'Nombre del rol de cobertura.',
  },
  {
    name: 'DRILL_EXPECTED_ROW_COUNTS',
    required: 'no',
    defaultValue: '—',
    example: 'properties=1200,listings=3400',
    connection: '—',
    description: '`tabla=n,tabla=n`: recuentos que la base restaurada debe tener.',
  },
  {
    name: 'DRILL_BACKUP_NAME',
    required: 'no',
    defaultValue: '— (la más reciente)',
    example: 'buscahogar-20260101T030000Z.dump.age',
    connection: '—',
    description: 'Restaurar esa copia en lugar de la última.',
  },
  {
    name: 'DRILL_INGESTION_DIR',
    required: 'no',
    defaultValue: '/opt/ingestion',
    example: '/opt/ingestion',
    connection: '—',
    description: 'JavaScript compilado de `apps/ingestion` dentro de la imagen `drill`.',
  },
  {
    name: 'SEED_MONTHLY_QUOTA_TOTAL',
    required: 'no',
    defaultValue: '—',
    example: '<cuota mensual>',
    connection: '—',
    description: 'Se pasa al aprovisionamiento, igual que en el despliegue.',
  },
  {
    name: 'SEED_MONTHLY_QUOTA_RESERVE',
    required: 'no',
    defaultValue: '—',
    example: '<reserva>',
    connection: '—',
    description: 'Se pasa al aprovisionamiento.',
  },
];

export const ENV_MANIFEST: Readonly<Record<EnvService, readonly EnvVarSpec[]>> = {
  worker: WORKER,
  deploy: DEPLOY,
  backup: BACKUP,
  drill: DRILL,
};
