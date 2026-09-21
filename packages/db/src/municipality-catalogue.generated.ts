// GENERADO — por apps/ingestion/scripts/import-municipality-catalogue.ts
// (ROADMAP 1.13, DD-2/DD-6). NO editar a mano: vuelve a ejecutar el
// conversor contra los ficheros fuente reales y sustituye este fichero
// entero.
//
// PLACEHOLDER, deliberadamente vacío — R7 (precondición de aplicación que
// ningún agente de este proyecto puede saltarse): ningún agente puede
// descargar ni leer el fichero real del NGMEP (Nomenclátor Geográfico de
// Municipios y Entidades de Población, CNIG) ni el registro de municipios
// del INE. Antes de que este fichero lleve datos reales, el operador debe:
//   1. descargar el NGMEP (CNIG) y el registro de municipios del INE;
//   2. rellenar `NGMEP_FIELD_MAP` (apps/ingestion/src/catalogue/ngmep-parse.ts)
//      e `INE_REGISTER_FIELD_MAP` (apps/ingestion/src/catalogue/ine-register.ts)
//      con los nombres de columna reales, tras verificar contra el fichero
//      en mano: (a) presencia/ausencia de una columna de código INE de 5
//      dígitos; (b) la ortografía exacta de la cabecera; (c) si
//      latitud/longitud vienen en grados decimales o en DMS; (d) el
//      delimitador y la codificación reales (un CSV del CNIG es
//      plausiblemente `;`+Latin-1, nunca asumido `,`+UTF-8);
//   3. ejecutar `apps/ingestion/scripts/import-municipality-catalogue.ts`
//      (composition root) contra los ficheros reales;
//   4. commitear el fichero resultante, sustituyendo este placeholder
//      entero — provenance, atribución CC-BY/IGN y todas las filas
//      incluidas.
//
// Un catálogo importado vacío es una fusión SIN efecto (`mergeCatalogues`,
// DD-2/CR-15): Granada (18087) sigue sembrándose exactamente igual que hoy,
// con su cita manual, hasta que este placeholder se sustituya por datos
// reales. Ninguna coordenada se fabrica aquí ni en ningún otro punto de
// este cambio (P5, CLAUDE.md).
import type { MunicipalitySeed } from './seed-data.js';

export const IMPORTED_MUNICIPALITY_CATALOGUE: readonly MunicipalitySeed[] = [];
