// ROADMAP 3.4 (decisión 257, D9; R2.3, R5.4; NF3) — lectura y validación Zod del entorno del despliegue.
// Función PURA: recibe el entorno como parámetro (el único que lee `process.env` es `scripts/deploy.ts`).
//
//   DIRECT_DATABASE_URL         obligatoria. URL DIRECTA del propietario (no la del pooler). SIN respaldo: si
//                               falta, el despliegue falla; nunca cae a `DATABASE_URL` (R2.3).
//   WEB_READONLY_PASSWORD       obligatoria, no en blanco. Secreto del rol `web_readonly`.
//   WEB_COVERAGE_PASSWORD       obligatoria, no en blanco. Secreto del rol `web_coverage`.
//   WEB_READONLY_ROLE           opcional (por defecto `web_readonly`). Nombre del rol de solo lectura.
//   WEB_COVERAGE_ROLE           opcional (por defecto `web_coverage`). Nombre del rol de cobertura.
//   SEED_MONTHLY_QUOTA_TOTAL    opcional, junto con la reserva (todo o nada). Total mensual a sembrar SOLO si el
//   SEED_MONTHLY_QUOTA_RESERVE  registro de cuota no tiene ninguna fila. Sin valor por defecto: una cifra
//                               inventada sería gasto contra un techo que nadie decidió (decisión 066).
//
// Los mensajes nombran variables y reglas, NUNCA valores (las URL y los secretos no se repiten).
import { z } from 'zod';

import type { DeployConfig } from '@buscahogar/db/deploy';

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
// Límite de la columna `integer` de Postgres.
const INT4_MAX = 2_147_483_647;

export type DeployConfigResult =
  | { readonly ok: true; readonly config: DeployConfig }
  | { readonly ok: false; readonly issues: readonly string[] };

// Una variable vacía o en blanco equivale a ausente (Compose pasa `''` para las no definidas).
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const secret = (name: string): z.ZodType<string> =>
  z
    .string({ error: `${name} es obligatoria (secreto del rol).` })
    .refine((value) => value.trim() !== '', `${name} no puede estar en blanco.`);

const roleName = (name: string, fallback: string): z.ZodType<string> =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(ROLE_NAME, `${name} debe ser un identificador simple en minúsculas (letras, dígitos y _).`)
      .default(fallback)
  );

const positiveInt = (name: string): z.ZodType<number | undefined> =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^(0|[1-9]\d*)$/, `${name} debe ser un entero decimal sin signo.`)
      .transform(Number)
      .pipe(z.number().max(INT4_MAX, `${name} no puede superar ${String(INT4_MAX)}.`))
      .optional()
  );

const EnvSchema = z
  .object({
    DIRECT_DATABASE_URL: z
      .string({
        error:
          'Falta DIRECT_DATABASE_URL: el despliegue exige la URL directa del propietario (no la del pooler) y no usa ' +
          'DATABASE_URL como respaldo.',
      })
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'DIRECT_DATABASE_URL debe ser una URL postgres:// o postgresql://.')
      .refine((value) => URL.canParse(value), 'DIRECT_DATABASE_URL no es una URL legible.'),
    WEB_READONLY_PASSWORD: secret('WEB_READONLY_PASSWORD'),
    WEB_COVERAGE_PASSWORD: secret('WEB_COVERAGE_PASSWORD'),
    WEB_READONLY_ROLE: roleName('WEB_READONLY_ROLE', 'web_readonly'),
    WEB_COVERAGE_ROLE: roleName('WEB_COVERAGE_ROLE', 'web_coverage'),
    SEED_MONTHLY_QUOTA_TOTAL: positiveInt('SEED_MONTHLY_QUOTA_TOTAL'),
    SEED_MONTHLY_QUOTA_RESERVE: positiveInt('SEED_MONTHLY_QUOTA_RESERVE'),
  })
  .superRefine((env, context) => {
    const total = env.SEED_MONTHLY_QUOTA_TOTAL;
    const reserve = env.SEED_MONTHLY_QUOTA_RESERVE;
    if (total === undefined && reserve !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_MONTHLY_QUOTA_TOTAL'],
        message: 'SEED_MONTHLY_QUOTA_TOTAL es obligatoria si se define SEED_MONTHLY_QUOTA_RESERVE.',
      });
    }
    if (reserve === undefined && total !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_MONTHLY_QUOTA_RESERVE'],
        message: 'SEED_MONTHLY_QUOTA_RESERVE es obligatoria si se define SEED_MONTHLY_QUOTA_TOTAL.',
      });
    }
    if (total !== undefined && total < 1) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_MONTHLY_QUOTA_TOTAL'],
        message: 'SEED_MONTHLY_QUOTA_TOTAL debe ser un entero positivo.',
      });
    }
    if (total !== undefined && reserve !== undefined && reserve >= total) {
      context.addIssue({
        code: 'custom',
        path: ['SEED_MONTHLY_QUOTA_RESERVE'],
        message: 'SEED_MONTHLY_QUOTA_RESERVE debe ser menor que SEED_MONTHLY_QUOTA_TOTAL.',
      });
    }
  });

export function readDeployConfig(env: Readonly<Record<string, string | undefined>>): DeployConfigResult {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Solo variable + mensaje propio: nunca `issue.input`.
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  }
  const data = parsed.data;
  const quotaSeed =
    data.SEED_MONTHLY_QUOTA_TOTAL !== undefined && data.SEED_MONTHLY_QUOTA_RESERVE !== undefined
      ? { totalCap: data.SEED_MONTHLY_QUOTA_TOTAL, reserve: data.SEED_MONTHLY_QUOTA_RESERVE }
      : null;
  return {
    ok: true,
    config: {
      ownerUrl: data.DIRECT_DATABASE_URL,
      roleNames: { readonly: data.WEB_READONLY_ROLE, coverage: data.WEB_COVERAGE_ROLE },
      passwords: { readonly: data.WEB_READONLY_PASSWORD, coverage: data.WEB_COVERAGE_PASSWORD },
      quotaSeed,
    },
  };
}
