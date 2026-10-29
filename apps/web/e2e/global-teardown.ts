// Paso D.1b (diseño A7, decisión 138) — fusiona las huellas axe preparadas por
// `a11y.spec.ts` en `baselines/axe-baseline.json` al terminar una ejecución de
// actualización. Sin entradas preparadas (ejecución normal) no toca nada.
import { AXE_TAGS, mergeBaseline, serializeBaseline } from './axe-baseline';
import { readBaseline, takeStaged, writeBaseline } from './axe-files';

export default function globalTeardown(): void {
  const staged = takeStaged();
  if (staged.length === 0) {
    return;
  }
  writeBaseline(serializeBaseline(mergeBaseline(readBaseline(), staged, AXE_TAGS)));
}
