// ROADMAP 3.4 (decisión 263; R10.4, D21) — identidad del titular para el aviso legal (LSSI-CE) y para
// la política de privacidad. Sale de variables de servidor `LEGAL_OWNER_*`, validadas con Zod: nunca se
// escribe en el código ni se inventa. Cada dato sin definir se sustituye por un marcador claramente
// visible («[Pendiente de configurar: …]») y, en producción, el arranque avisa (sin fallar).
//
// Sin `server-only`: es un módulo puro que recibe el entorno. Las páginas legales lo leen al compilar o
// al renderizar; cambiarlo exige un redespliegue, igual que las teselas (decisión 261).
import { z } from 'zod';

export type LegalIdentityEnv = Readonly<Record<string, string | undefined>>;

export interface LegalIdentityField {
  // El valor configurado o, si falta, el marcador visible.
  readonly value: string;
  readonly configured: boolean;
}

export interface LegalIdentity {
  readonly name: LegalIdentityField;
  readonly taxId: LegalIdentityField;
  readonly address: LegalIdentityField;
  readonly email: LegalIdentityField;
  readonly complete: boolean;
  // Nombres de las variables sin definir, en el orden de los campos (nunca valores).
  readonly missing: readonly string[];
}

// El mensaje nombra la variable, jamás el valor.
export class InvalidLegalIdentityError extends Error {}

const MAX_FIELD_LENGTH = 300;

// Texto plano de una línea: sin marcado ni caracteres de control. Se pinta escapado, pero se rechaza igual.
const textSchema = z
  .string()
  .min(1)
  .max(MAX_FIELD_LENGTH)
  .refine((value) => !/[<>]/.test(value) && !/\p{Cc}/u.test(value));
const emailSchema = z.email().max(MAX_FIELD_LENGTH);

interface FieldSpec {
  readonly variable: string;
  readonly placeholder: string;
  readonly schema: z.ZodType<string>;
}

const NAME_SPEC: FieldSpec = {
  variable: 'LEGAL_OWNER_NAME',
  placeholder: '[Pendiente de configurar: nombre o razón social del titular]',
  schema: textSchema,
};
const TAX_ID_SPEC: FieldSpec = {
  variable: 'LEGAL_OWNER_TAX_ID',
  placeholder: '[Pendiente de configurar: NIF o CIF del titular]',
  schema: textSchema,
};
const ADDRESS_SPEC: FieldSpec = {
  variable: 'LEGAL_OWNER_ADDRESS',
  placeholder: '[Pendiente de configurar: domicilio del titular]',
  schema: textSchema,
};
const EMAIL_SPEC: FieldSpec = {
  variable: 'LEGAL_OWNER_EMAIL',
  placeholder: '[Pendiente de configurar: correo electrónico de contacto]',
  schema: emailSchema,
};

function resolveField(spec: FieldSpec, env: LegalIdentityEnv): LegalIdentityField {
  const raw = env[spec.variable]?.trim() ?? '';
  if (raw === '') {
    return { value: spec.placeholder, configured: false };
  }
  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidLegalIdentityError(
      `${spec.variable} no es válida: texto plano de una línea, sin marcado, de hasta ` +
        `${String(MAX_FIELD_LENGTH)} caracteres${spec === EMAIL_SPEC ? ' y con forma de correo electrónico' : ''} ` +
        '(docs/DECISIONS.md, decisión 263).'
    );
  }
  return { value: parsed.data, configured: true };
}

export function parseLegalIdentity(env: LegalIdentityEnv): LegalIdentity {
  const name = resolveField(NAME_SPEC, env);
  const taxId = resolveField(TAX_ID_SPEC, env);
  const address = resolveField(ADDRESS_SPEC, env);
  const email = resolveField(EMAIL_SPEC, env);
  const missing: string[] = [];
  if (!name.configured) missing.push(NAME_SPEC.variable);
  if (!taxId.configured) missing.push(TAX_ID_SPEC.variable);
  if (!address.configured) missing.push(ADDRESS_SPEC.variable);
  if (!email.configured) missing.push(EMAIL_SPEC.variable);
  return { name, taxId, address, email, complete: missing.length === 0, missing };
}

export function readLegalIdentity(): LegalIdentity {
  return parseLegalIdentity(process.env);
}

// Aviso de arranque (R10.4): solo en producción y solo si falta algún dato. Nombra variables, nunca
// valores. Quien lo emita (`instrumentation.ts`, paso 3.4/S8) decide el canal; aquí no se escribe nada.
export function legalIdentityStartupWarning(
  identity: LegalIdentity,
  nodeEnv: string | undefined
): string | null {
  if (nodeEnv !== 'production' || identity.complete) {
    return null;
  }
  return (
    `Identidad del titular incompleta: faltan ${identity.missing.join(', ')}. Las páginas legales muestran ` +
    'marcadores «[Pendiente de configurar: …]» hasta que se definan (docs/DECISIONS.md, decisión 263).'
  );
}
