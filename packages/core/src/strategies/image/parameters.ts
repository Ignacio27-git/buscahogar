// IMAGE_HAMMING_THRESHOLD (ROADMAP 2.3, decisión 097): T calibrado a partir
// de `calibration-report.json`
// (apps/ingestion/test/fixtures/images/calibration-report.json, read-only
// desde aquí — packages/core no puede leer ficheros en producción, spec "No
// Native or I-O Dependencies in packages/core"). Producido corriendo
// `scripts/calibrate-image-threshold.ts` contra `hashes.calibration.json`
// (6 bases de calibración, 48 positivos, 15 negativos cruzados; regla FIJA
// T = min(10, dNegMin-2)). Resultado real: dNegMin=20, T=10 (clamped al
// máximo — la separación entre fachadas de edificios distintos bajo el
// mismo chrome de portal resultó holgada), recall de positivos en T =
// 85.4%. Cambiar T exige re-ejecutar la calibración y actualizar esta
// constante a mano; NUNCA se lee el fichero en tiempo de ejecución — este
// módulo es una constante `as const`, igual que `WEIGHTS`/`T_HIGH`/`T_LOW`
// de rule-based/weights.ts, no un parámetro configurable (decisión 049).
export const IMAGE_HAMMING_THRESHOLD = 10;
