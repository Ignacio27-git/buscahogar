// D.14 (decisión 188; spike de Fase 0 resuelto como FAIL-B3, decisión 191 rechazada) —
// estructura estática de `src/app`:
//   - La home vive en el grupo de rutas `(search)`; la URL pública sigue siendo `/`.
//   - NO hay ningún `loading.tsx`: un `loading.tsx` raíz envolvería el layout anidado de la ficha
//     (responder 200 para una ficha inexistente), y los de `(search)` y de la ficha dejan, sin
//     JavaScript, el contenido real escondido en `<div hidden id="S:n">` para siempre.
//   - La ficha no tiene `not-found.tsx` propio: sirve el raíz.
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const APP_DIR = fileURLToPath(new URL('../src/app/', import.meta.url));
const FICHA_DIR = `${APP_DIR}properties/[listingId]/`;

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...listFiles(`${dir}${entry.name}/`));
    } else {
      files.push(`${dir}${entry.name}`);
    }
  }
  return files;
}

describe('estructura de src/app (D.14, decisión 188)', () => {
  it('la home vive en app/(search)/page.tsx y ya no en app/page.tsx', () => {
    expect(existsSync(`${APP_DIR}(search)/page.tsx`)).toBe(true);
    expect(existsSync(`${APP_DIR}page.tsx`)).toBe(false);
  });

  it('no hay ningún loading.tsx en src/app (raíz, (search) ni ficha)', () => {
    const files = listFiles(APP_DIR);

    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((file) => /(^|\/)loading\.tsx?$/.test(file))).toEqual([]);
    expect(existsSync(`${APP_DIR}loading.tsx`)).toBe(false);
    expect(existsSync(`${APP_DIR}(search)/loading.tsx`)).toBe(false);
    expect(existsSync(`${FICHA_DIR}loading.tsx`)).toBe(false);
  });

  it('la ficha conserva su layout y no tiene not-found.tsx propio', () => {
    expect(existsSync(`${FICHA_DIR}layout.tsx`)).toBe(true);
    expect(existsSync(`${FICHA_DIR}not-found.tsx`)).toBe(false);
  });

  it('el layout raíz sigue existiendo y el grupo (search) contiene solo la página de la home', () => {
    expect(existsSync(`${APP_DIR}layout.tsx`)).toBe(true);
    expect(listFiles(APP_DIR).filter((file) => file.includes('(search)'))).toEqual([`${APP_DIR}(search)/page.tsx`]);
  });
});
