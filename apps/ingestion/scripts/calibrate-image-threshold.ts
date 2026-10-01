// calibrate-image-threshold (ROADMAP 2.3, decisión 097) — CLI que lee
// `hashes.calibration.json`, ejecuta `computeCalibration` sobre las 6 bases
// de calibración (`provenance.json`, `set==='calibration'`) y escribe
// `calibration-report.json` (histogramas, dNegMin, T, recall de positivos
// en T). Si T<1, ABORTA: exit 1, ningún `calibration-report.json` (spec
// "Calibration Aborts on a Degenerate Threshold") — `runCalibrateThreshold`
// recibe el JSON y las bases ya resueltos, así que un test puede forzar el
// aborto con datos sintéticos sin tocar los ficheros reales de fixtures.
// Solo I/O local — cero red, cero base de datos.
//
// Sin test dedicado para `main()`/el shell de CLI, mismo precedente que
// scripts/calibrate-blocking.ts: orquesta `runCalibrateThreshold` (SÍ
// cubierta, `image-calibration.test.ts`) más dos lecturas triviales de
// fichero.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CalibrationAbortError, computeCalibration } from '../src/image-hash/calibration.js';
import { imageHashTableSchema } from '../src/image-hash/hash-table.schema.js';
import { imageProvenanceSchema } from '../src/image-hash/provenance.schema.js';

const FIXTURES_DIR = fileURLToPath(new URL('../test/fixtures/images/', import.meta.url));
const REPORT_PATH = `${FIXTURES_DIR}calibration-report.json`;

function baseIdOf(file: string): string {
  return file.replace(/\.jpg$/, '');
}

export function calibrationBaseIds(provenanceJson: string): readonly string[] {
  const provenance = imageProvenanceSchema.parse(JSON.parse(provenanceJson));
  return provenance.filter((entry) => entry.set === 'calibration').map((entry) => baseIdOf(entry.file));
}

export interface CalibrateIo {
  log(line: string): void;
  writeFile(path: string, text: string): void;
}

// `hashTableJson`/`bases` YA resueltos (no leídos de disco aquí): permite
// testear el camino feliz Y el aborto con datos sintéticos, sin depender de
// los ficheros reales de fixtures (image-calibration.test.ts).
export function runCalibrateThreshold(
  hashTableJson: string,
  bases: readonly string[],
  io: CalibrateIo
): number {
  const table = imageHashTableSchema.parse(JSON.parse(hashTableJson));

  try {
    const report = computeCalibration(table.entries, bases);
    io.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    io.log(
      `T=${String(report.threshold)} dNegMin=${String(report.dNegMin)} recall@T=${String(report.positiveRecallAtThreshold)}`
    );
    return 0;
  } catch (error) {
    if (error instanceof CalibrationAbortError) {
      io.log(error.message);
      return 1;
    }
    throw error;
  }
}

export function main(): void {
  const io: CalibrateIo = {
    log: (line: string): void => {
      console.log(line);
    },
    writeFile: (path: string, text: string): void => {
      writeFileSync(path, text, 'utf8');
    },
  };

  const hashTableJson = readFileSync(`${FIXTURES_DIR}hashes.calibration.json`, 'utf8');
  const provenanceJson = readFileSync(`${FIXTURES_DIR}provenance.json`, 'utf8');
  const bases = calibrationBaseIds(provenanceJson);

  process.exitCode = runCalibrateThreshold(hashTableJson, bases, io);
}

// Se ejecuta solo como entrypoint, nunca al importarlo desde un test — mismo
// patrón que scripts/calibrate-blocking.ts y scripts/generate-image-hashes.ts.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
