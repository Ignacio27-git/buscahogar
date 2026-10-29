// ROADMAP 3.4 (decisión 263 parte C; D22; R12.3, NF2) — ninguna credencial se expone como variable
// `NEXT_PUBLIC_*`: Next incrusta esas variables en el JavaScript de cada navegador. Este módulo PURO decide qué
// nombres están prohibidos y localiza los que aparecen en el texto de los ficheros versionados; lo usan
// `check:public-env` (CI, sobre `git ls-files`) y el clasificador de entorno (`env:check`, nombres del entorno).
//
// Solo se devuelven NOMBRES, ficheros y números de línea: jamás el contenido que rodea al nombre.
//
// Patrón (D22): `NEXT_PUBLIC_` seguido de cualquier nombre que contenga una palabra de credencial. Una variable
// legítimamente pública (p. ej. el nombre del sitio) no la contiene.
const CREDENTIAL_WORDS = 'SECRET|TOKEN|PASSWORD|PASS|KEY|PRIVATE|CREDENTIAL|AUTH|DATABASE|DB_URL';

function forbiddenPattern(): RegExp {
  return new RegExp(`NEXT_PUBLIC_\\w*(?:${CREDENTIAL_WORDS})\\w*`, 'g');
}

export interface PublicEnvFinding {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

// Nombres prohibidos entre los dados (variables del entorno), sin repetidos y en orden alfabético.
export function forbiddenPublicEnvNames(names: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const name of names) {
    // Un nombre de variable es una sola palabra: debe coincidir entero, no solo contener el patrón.
    const match = forbiddenPattern().exec(name);
    if (match !== null && match[0] === name) {
      found.add(name);
    }
  }
  return [...found].sort();
}

export function scanTextForPublicEnv(file: string, text: string): PublicEnvFinding[] {
  const findings: PublicEnvFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, index) => {
    for (const match of content.matchAll(forbiddenPattern())) {
      findings.push({ file, line: index + 1, name: match[0] });
    }
  });
  return findings;
}

// `.env`, `.env.local`, `.env.example`, `apps/web/.env`…: se excluyen siempre y NUNCA se leen (pueden
// contener secretos reales; la regla del proyecto es no abrirlos).
export function isEnvFile(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base === '.env' || base.startsWith('.env.');
}

// `read` devuelve el texto del fichero o `null` si no es legible como texto (binario, borrado…).
export function scanFilesForPublicEnv(
  paths: readonly string[],
  read: (path: string) => string | null
): PublicEnvFinding[] {
  const findings: PublicEnvFinding[] = [];
  for (const path of paths) {
    if (isEnvFile(path)) {
      continue;
    }
    const text = read(path);
    if (text !== null) {
      findings.push(...scanTextForPublicEnv(path, text));
    }
  }
  return findings;
}
