// ROADMAP 3.4 (decisión 260, D18; R8.4; NF3) — lectura y validación Zod del entorno de las comprobaciones del
// simulacro de restauración. Función PURA: el único que lee `process.env` es `scripts/restore-verify.ts`.
//
//   DIRECT_DATABASE_URL        obligatoria. URL DIRECTA de la base restaurada. SIN respaldo: jamás cae a
//                              `DATABASE_URL` (la misma regla que el despliegue, R2.3).
//   WEB_READONLY_ROLE          opcional (por defecto `web_readonly`).
//   WEB_COVERAGE_ROLE          opcional (por defecto `web_coverage`).
//   DRILL_EXPECTED_ROW_COUNTS  opcional, `tabla=n,tabla=n`: recuentos que la base restaurada debe tener.
//
// Los mensajes nombran variables y reglas, NUNCA valores.
import { z } from 'zod';

import { parseExpectedRowCounts } from '@buscahogar/db/deploy';
import type { RoleNames } from '@buscahogar/db/deploy';

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export interface RestoreVerifyConfig {
  readonly url: string;
  readonly names: RoleNames;
  readonly expectedRowCounts: Readonly<Record<string, number>>;
}

export type RestoreVerifyConfigResult =
  | { readonly ok: true; readonly config: RestoreVerifyConfig }
  | { readonly ok: false; readonly issues: readonly string[] };

// Una variable vacía o en blanco equivale a ausente (Compose pasa `''` para las no definidas).
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const roleName = (name: string, fallback: string): z.ZodType<string> =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(ROLE_NAME, `${name} debe ser un identificador simple en minúsculas (letras, dígitos y _).`)
      .default(fallback)
  );

const EnvSchema = z.object({
  DIRECT_DATABASE_URL: z
    .string({
      error:
        'Falta DIRECT_DATABASE_URL: la comprobación exige la URL directa de la base restaurada y no usa ' +
        'DATABASE_URL como respaldo.',
    })
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'DIRECT_DATABASE_URL debe ser una URL postgres:// o postgresql://.')
    .refine((value) => URL.canParse(value), 'DIRECT_DATABASE_URL no es una URL legible.'),
  WEB_READONLY_ROLE: roleName('WEB_READONLY_ROLE', 'web_readonly'),
  WEB_COVERAGE_ROLE: roleName('WEB_COVERAGE_ROLE', 'web_coverage'),
  DRILL_EXPECTED_ROW_COUNTS: z.preprocess(blankToUndefined, z.string().optional()).pipe(
    z.string().optional().superRefine((value, context) => {
      try {
        parseExpectedRowCounts(value);
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'DRILL_EXPECTED_ROW_COUNTS debe tener la forma tabla=n,tabla=n (n entero >= 0).',
        });
      }
    })
  ),
});

export function readRestoreVerifyConfig(env: Readonly<Record<string, string | undefined>>): RestoreVerifyConfigResult {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Solo el mensaje propio: nunca `issue.input`.
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  }
  const data = parsed.data;
  return {
    ok: true,
    config: {
      url: data.DIRECT_DATABASE_URL,
      names: { readonly: data.WEB_READONLY_ROLE, coverage: data.WEB_COVERAGE_ROLE },
      expectedRowCounts: parseExpectedRowCounts(data.DRILL_EXPECTED_ROW_COUNTS),
    },
  };
}
