// Sub-barril del intérprete de lenguaje natural (ROADMAP 3.1). Solo se
// reexporta lo que el diseño declara público; tokenize, amount y vocabulary
// son internos.
export { interpretSearchText } from './interpret.js';
export { NL_PARAM_KEYS } from './types.js';
export type {
  NlConflict,
  NlParamKey,
  NlSearchInterpretation,
  RecognisedFragment,
  TextSpan,
} from './types.js';
