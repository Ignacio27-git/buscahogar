// ROADMAP 3.4 (decisión 257, D10; R5.3) — verificador SCRAM-SHA-256 de una contraseña, calculado en Node.
// PostgreSQL acepta como `PASSWORD` un verificador ya calculado
// (`SCRAM-SHA-256$<iteraciones>:<sal>$<StoredKey>:<ServerKey>`) y lo guarda tal cual: la contraseña en
// claro nunca aparece en una sentencia SQL, en el registro del servidor ni en los logs del despliegue.
// Este módulo no lee `process.env` (decisión 024): la contraseña llega como parámetro.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

// Iteraciones por defecto de PostgreSQL (`scram_iterations`).
const SCRAM_ITERATIONS = 4096;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

// ASCII imprimible (espacio incluido). PostgreSQL normaliza con SASLprep las contraseñas con otros
// caracteres; implementarlo aquí abriría una divergencia silenciosa con el servidor, así que se rechazan
// de forma explícita (un secreto de despliegue se genera, no se teclea).
const PRINTABLE_ASCII = /^[ -~]+$/;

export interface ScramOptions {
  // Solo para pruebas deterministas; en producción se genera una sal aleatoria por verificador.
  readonly salt?: Buffer;
  readonly iterations?: number;
}

export function scramSha256Verifier(password: string, options: ScramOptions = {}): string {
  if (!PRINTABLE_ASCII.test(password)) {
    // El mensaje nunca incluye la contraseña.
    throw new Error('La contraseña del rol debe ser texto ASCII imprimible y no estar vacía.');
  }
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const iterations = options.iterations ?? SCRAM_ITERATIONS;

  const saltedPassword = pbkdf2Sync(password, salt, iterations, KEY_BYTES, 'sha256');
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest();

  return `SCRAM-SHA-256$${String(iterations)}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
