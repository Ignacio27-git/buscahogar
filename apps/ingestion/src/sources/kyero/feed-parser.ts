// Paso 1.14 — parseFeed: XML crudo -> array de propiedades sin validar
// (diseño D2/D3). Puro respecto al feed en memoria — no hace I/O; el único
// fetch del adaptador vive en http-feed-fetcher.ts (D1).
//
// Configuración del parser (D3):
// - ignoreAttributes: true — ningún campo de este adaptador depende de un
//   atributo XML (el `id="1"` de <image> es descartable, D-note research).
// - parseTagValue: false — TODOS los valores quedan como string. Ningún
//   campo se coacciona aquí; raw-property.schema.ts decide caso a caso con
//   sus propios helpers (numericText/signedNumericText/intText). Así
//   <id>00123</id> nunca se convierte en el número 123 (research R4,
//   fast-xml-parser issue #646).
// - trimValues: true — mismo criterio que el resto del repo (raw-element
//   schema de Idealista no lo necesita porque su fuente es JSON).
// - isArray: fuerza kyero.property y kyero.property.images.image a array
//   SIEMPRE, incluso con un único elemento (fast-xml-parser issue #490).
import { XMLParser, XMLValidator, type MatcherView } from 'fast-xml-parser';

import { KyeroFeedParseError } from './errors.js';

const ARRAY_PATHS = new Set(['kyero.property', 'kyero.property.images.image']);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  // jPath puede ser `string | MatcherView` en la firma de fast-xml-parser@5
  // (la opción `jPath` alternativa, que este adaptador nunca activa) — en
  // la práctica siempre llega como string.
  isArray: (_tagName: string, jPath: string | MatcherView): boolean => typeof jPath === 'string' && ARRAY_PATHS.has(jPath),
});

// XMLValidator está deprecado en fast-xml-parser@5.11.1 en favor del
// paquete separado `fast-xml-validator` (ver fxp.d.ts:731-732), pero sigue
// siendo funcional y es exactamente lo que el diseño de este paso fija
// (D3: "XMLValidator.validate first"). Añadir una dependencia nueva solo
// para silenciar un deprecation warning no está en el alcance de esta
// tarea — deuda anotada, no ignorada en silencio.
// eslint-disable-next-line @typescript-eslint/no-deprecated
function describeValidationError(result: ReturnType<typeof XMLValidator.validate>): string {
  if (result === true) return 'desconocido';
  return `${result.err.msg} (línea ${String(result.err.line)}, columna ${String(result.err.col)})`;
}

export function parseFeed(xml: string): readonly unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- ver nota sobre XMLValidator más arriba.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new KyeroFeedParseError(`XML mal formado: ${describeValidationError(validation)}`);
  }

  const parsed = parser.parse(xml) as unknown;
  const kyero = typeof parsed === 'object' && parsed !== null ? (parsed as { kyero?: unknown }).kyero : undefined;

  if (typeof kyero !== 'object' || kyero === null) {
    throw new KyeroFeedParseError('el feed no tiene un elemento raíz <kyero> válido.');
  }

  const property = (kyero as { property?: unknown }).property;
  if (property === undefined) return [];
  if (!Array.isArray(property)) {
    throw new KyeroFeedParseError('kyero.property no es una lista de propiedades.');
  }

  return property;
}
