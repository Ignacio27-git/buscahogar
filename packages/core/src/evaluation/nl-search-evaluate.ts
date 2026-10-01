import { interpretSearchText } from '../nl-search/interpret.js';
import { NL_PARAM_KEYS, type NlSearchInterpretation } from '../nl-search/types.js';
import type { NlCorpusEntry, NlCorpusSplit, NlExpectedField } from './nl-search-corpus.js';
import { wilsonInterval, type Interval } from './metrics.js';

// ROADMAP 3.1 (decisión 124) — evaluador del intérprete de lenguaje natural.
// Compara, campo a campo, lo esperado con lo que devuelve el intérprete:
//   correct  : esperado y devuelto con el mismo valor
//   missed   : esperado y no devuelto (fallo por omisión: el usuario repite)
//   wrong    : esperado y devuelto con otro valor (criterio falso)
//   spurious : no esperado y devuelto (criterio falso)
// `wrong` y `spurious` son los fallos graves: alteran la búsqueda sin que el
// usuario lo haya pedido. Un acierto exacto exige cero de los tres fallos.
export type FieldOutcome = 'correct' | 'missed' | 'wrong' | 'spurious';

export const NL_EVALUATED_FIELDS: readonly NlExpectedField[] = [...NL_PARAM_KEYS, 'place'];

export interface FieldCounts {
  correct: number;
  missed: number;
  wrong: number;
  spurious: number;
}

export interface EntryEvaluation {
  readonly id: string;
  readonly split: NlCorpusSplit;
  readonly category: NlCorpusEntry['category'];
  // Solo los campos que el corpus espera o que el intérprete devuelve.
  readonly outcomes: Readonly<Partial<Record<NlExpectedField, FieldOutcome>>>;
  readonly exact: boolean;
}

export interface HitRate {
  readonly hits: number;
  readonly trials: number;
  readonly value: number | null;
  readonly wilson95: Interval | null;
}

export interface SplitEvaluation {
  readonly entries: readonly EntryEvaluation[];
  readonly perField: Readonly<Record<NlExpectedField, FieldCounts>>;
  readonly hitRate: HitRate;
  // Campos `wrong` + `spurious` en las entradas `hard-negative`.
  readonly hardNegativeFalseCriteria: number;
}

export interface NlCorpusEvaluation {
  readonly dev: SplitEvaluation;
  readonly holdout: SplitEvaluation;
  readonly all: SplitEvaluation;
}

export type NlInterpreter = (text: string) => NlSearchInterpretation;

function valueOf(
  field: NlExpectedField,
  params: Readonly<Partial<Record<string, string>>>,
  placeText: string | null
): string | undefined {
  if (field === 'place') {
    return placeText ?? undefined;
  }
  return params[field];
}

function classifyField(
  expected: string | undefined,
  actual: string | undefined
): FieldOutcome | null {
  if (expected === undefined && actual === undefined) return null;
  if (expected !== undefined && actual === undefined) return 'missed';
  if (expected === undefined) return 'spurious';
  return expected === actual ? 'correct' : 'wrong';
}

export function evaluateEntry(entry: NlCorpusEntry, interpret: NlInterpreter): EntryEvaluation {
  const interpretation = interpret(entry.text);
  const outcomes: Partial<Record<NlExpectedField, FieldOutcome>> = {};

  for (const field of NL_EVALUATED_FIELDS) {
    const outcome = classifyField(
      valueOf(field, entry.params, entry.placeText),
      valueOf(field, interpretation.params, interpretation.placeText)
    );
    if (outcome !== null) {
      outcomes[field] = outcome;
    }
  }

  return {
    id: entry.id,
    split: entry.split,
    category: entry.category,
    outcomes,
    exact: Object.values(outcomes).every((outcome) => outcome === 'correct'),
  };
}

function emptyCounts(): Record<NlExpectedField, FieldCounts> {
  const counts = {} as Record<NlExpectedField, FieldCounts>;
  for (const field of NL_EVALUATED_FIELDS) {
    counts[field] = { correct: 0, missed: 0, wrong: 0, spurious: 0 };
  }
  return counts;
}

function summarise(entries: readonly EntryEvaluation[]): SplitEvaluation {
  const perField = emptyCounts();
  let falseCriteria = 0;

  for (const evaluation of entries) {
    for (const [field, outcome] of Object.entries(evaluation.outcomes) as [
      NlExpectedField,
      FieldOutcome,
    ][]) {
      perField[field][outcome] += 1;
      if (
        evaluation.category === 'hard-negative' &&
        (outcome === 'wrong' || outcome === 'spurious')
      ) {
        falseCriteria += 1;
      }
    }
  }

  const hits = entries.filter((evaluation) => evaluation.exact).length;
  return {
    entries,
    perField,
    hitRate: {
      hits,
      trials: entries.length,
      value: entries.length > 0 ? hits / entries.length : null,
      wilson95: wilsonInterval(hits, entries.length),
    },
    hardNegativeFalseCriteria: falseCriteria,
  };
}

// El intérprete es inyectable para poder probar el evaluador con uno falso;
// por defecto se mide el real.
export function evaluateNlCorpus(
  corpus: readonly NlCorpusEntry[],
  interpret: NlInterpreter = interpretSearchText
): NlCorpusEvaluation {
  const evaluations = corpus.map((entry) => evaluateEntry(entry, interpret));
  return {
    dev: summarise(evaluations.filter((evaluation) => evaluation.split === 'dev')),
    holdout: summarise(evaluations.filter((evaluation) => evaluation.split === 'holdout')),
    all: summarise(evaluations),
  };
}
