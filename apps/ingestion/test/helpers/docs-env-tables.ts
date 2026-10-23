// Lector de las tablas de variables de entorno de `docs/DEPLOYMENT.md` (ROADMAP 3.4, decisión 263 parte C).
// Cada servicio tiene una sección `### <título>` con una tabla de seis columnas:
//   | Variable | Obligatoria | Por defecto | Ejemplo | URL | Descripción |
// Devuelve, por variable, las celdas que el test de deriva compara con el inventario del código.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface DocsEnvRow {
  readonly name: string;
  readonly required: string;
  readonly defaultValue: string;
  readonly connection: string;
}

const DEPLOYMENT_DOC = fileURLToPath(new URL('../../../../docs/DEPLOYMENT.md', import.meta.url));

export function readDeploymentDoc(): string {
  return readFileSync(DEPLOYMENT_DOC, 'utf8').replace(/\r\n/g, '\n');
}

function plain(cell: string): string {
  return cell.replaceAll('`', '').trim();
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

// Filas de la primera tabla bajo `### <heading>`, hasta el siguiente encabezado. Lanza si la sección o la
// tabla no existen: un documento sin tabla es una deriva, no un caso vacío.
export function readEnvTable(doc: string, heading: string): DocsEnvRow[] {
  const lines = doc.split('\n');
  const start = lines.findIndex((line) => line.trim() === `### ${heading}`);
  if (start < 0) {
    throw new Error(`docs/DEPLOYMENT.md no tiene la sección «### ${heading}».`);
  }
  const rows: DocsEnvRow[] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) {
      break;
    }
    if (!line.trim().startsWith('|')) {
      if (inTable) {
        break;
      }
      continue;
    }
    inTable = true;
    const cells = splitRow(line);
    if (cells.length < 5 || /^[-: ]+$/.test(cells[0] ?? '') || plain(cells[0] ?? '') === 'Variable') {
      continue;
    }
    rows.push({
      name: plain(cells[0] ?? ''),
      required: plain(cells[1] ?? ''),
      defaultValue: plain(cells[2] ?? ''),
      connection: plain(cells[4] ?? ''),
    });
  }
  if (rows.length === 0) {
    throw new Error(`La sección «### ${heading}» no contiene ninguna fila de variables.`);
  }
  return rows;
}
