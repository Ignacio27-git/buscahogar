// D.13 (decisión 181) — `CoverageNotice`: las 10 variantes del aviso de cobertura
// (V1-V10 de la especificación), renderizadas con `renderToStaticMarkup`. Se
// comprueban rol, región viva única, intención del texto (tuteo, sin jerga) y
// presencia del enlace de recarga vía `isReloadable`; las cadenas exactas solo
// se fijan donde la especificación lo pide (horas y título de «registrada»).
import { COVERAGE_JOB_MAX_ATTEMPTS } from '@buscahogar/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CoverageNoticeVariant } from '../src/components/coverage-notice.js';
import {
  CoverageNotice,
  isReloadable,
  noticeForOutcome,
} from '../src/components/coverage-notice.js';

const MUNICIPALITY = 'Leganés';
const RESETS_AT = new Date('2026-10-09T00:00:00Z'); // 2:00 en Madrid (CEST)
const STARTED_AT = new Date('2026-10-08T12:05:00Z'); // «8 oct 2026, 14:05»

function render(variant: CoverageNoticeVariant): string {
  return renderToStaticMarkup(<CoverageNotice variant={variant} />);
}

// Texto visible: sin etiquetas ni atributos (`dateTime` lleva ISO a propósito, para máquinas).
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

const VARIANTS: readonly {
  readonly id: string;
  readonly variant: CoverageNoticeVariant;
  readonly role: 'status' | 'alert';
  readonly reloadable: boolean;
  readonly title: RegExp;
  readonly detail: RegExp;
}[] = [
  {
    id: 'V1 not-sweepable',
    variant: { kind: 'not-sweepable', municipality: MUNICIPALITY },
    role: 'status',
    reloadable: false,
    title: /Todavía no hay viviendas de Leganés\./,
    detail: /no puedes pedir la actualización de la zona.*municipio cercano/,
  },
  {
    id: 'V2 cap-exhausted',
    variant: { kind: 'cap-exhausted', municipality: MUNICIPALITY, resetsAt: RESETS_AT },
    role: 'status',
    reloadable: false,
    title: /Todavía no hay viviendas de Leganés\./,
    detail: /límite diario de zonas nuevas.*a partir de las .*2:00.* de la madrugada/,
  },
  {
    id: 'V3 client-cap-exhausted',
    variant: { kind: 'client-cap-exhausted', municipality: MUNICIPALITY, resetsAt: RESETS_AT },
    role: 'status',
    reloadable: false,
    title: /Todavía no hay viviendas de Leganés\./,
    detail: /tu límite personal.*a partir de las .*2:00.* de la madrugada/,
  },
  {
    id: 'V4 registered-without-job',
    variant: { kind: 'registered-without-job', municipality: MUNICIPALITY },
    role: 'status',
    reloadable: true,
    title: /Tu solicitud de actualización de Leganés está registrada\./,
    detail: /Comprobar de nuevo/,
  },
  {
    id: 'V5 job pending',
    variant: { kind: 'job', municipality: MUNICIPALITY, status: 'pending', startedAt: null, retriesLeft: true },
    role: 'status',
    reloadable: true,
    title: /La actualización de Leganés está en cola\./,
    detail: /aparecerán en esta lista cuando termine/,
  },
  {
    id: 'V6 job running',
    variant: { kind: 'job', municipality: MUNICIPALITY, status: 'running', startedAt: STARTED_AT, retriesLeft: true },
    role: 'status',
    reloadable: true,
    title: /La actualización de Leganés está en curso\./,
    // P7 (pulido de D.21): la fecha va en un `<time>` que no se parte (CSS `white-space: nowrap`).
    detail: /Empezó el <time class="coverage-notice__date" dateTime="2026-10-08T12:05:00.000Z">8 oct 2026, 14:05<\/time>\./,
  },
  {
    id: 'V7 job done',
    variant: { kind: 'job', municipality: MUNICIPALITY, status: 'done', startedAt: STARTED_AT, retriesLeft: true },
    role: 'status',
    reloadable: true,
    title: /La actualización de Leganés ha terminado\./,
    detail: /Pulsa «Comprobar de nuevo» si aún no ves sus viviendas/,
  },
  {
    id: 'V8 job failed',
    variant: { kind: 'job', municipality: MUNICIPALITY, status: 'failed', startedAt: STARTED_AT, retriesLeft: true },
    role: 'alert',
    reloadable: true,
    title: /La actualización de Leganés ha fallado\./,
    detail: /Lo volveremos a intentar más tarde/,
  },
  {
    id: 'V9 outside-polygon',
    variant: { kind: 'outside-polygon' },
    role: 'status',
    reloadable: false,
    title: /No hay viviendas en la zona dibujada\./,
    detail: /Dibujar una zona no pide su actualización/,
  },
  {
    id: 'V10 unknown-zone',
    variant: { kind: 'unknown-zone' },
    role: 'status',
    reloadable: false,
    title: /El enlace lleva un municipio que no existe\./,
    detail: /buscador/,
  },
];

describe.each(VARIANTS)('CoverageNotice $id', ({ variant, role, reloadable, title, detail }) => {
  it(`es una única región viva con role="${role}" y aria-atomic`, () => {
    const html = render(variant);
    expect(html.match(/role="(status|alert)"/g)).toEqual([`role="${role}"`]);
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain('aria-live');
  });

  it('lleva el título y el detalle de su intención', () => {
    const html = render(variant);
    expect(html).toMatch(title);
    expect(html).toMatch(detail);
  });

  it('no filtra jerga ni fechas ISO', () => {
    expect(visibleText(render(variant))).not.toMatch(/UTC|barrido|\d{4}-\d{2}-\d{2}/);
  });

  it(`isReloadable es ${String(reloadable)}`, () => {
    expect(isReloadable(variant)).toBe(reloadable);
  });
});

describe('CoverageNotice — hora de reinicio', () => {
  it('con 23:30Z (01:30 en Madrid) sigue diciendo «2:00» y no usa palabra de día', () => {
    const resetsAt = new Date('2026-10-09T00:00:00Z');
    const html = render({ kind: 'cap-exhausted', municipality: MUNICIPALITY, resetsAt });
    expect(html).toContain('2:00');
    expect(html).not.toMatch(/mañana|hoy/i);
  });

  it('en invierno (CET) la hora de reinicio es «1:00»', () => {
    const resetsAt = new Date('2026-10-26T00:00:00Z');
    const html = render({ kind: 'client-cap-exhausted', municipality: MUNICIPALITY, resetsAt });
    expect(html).toContain('1:00');
    expect(html).not.toMatch(/mañana|hoy/i);
  });

  it('la hora va en un <time> con dateTime para poder enmascararla en las capturas', () => {
    const html = render({ kind: 'cap-exhausted', municipality: MUNICIPALITY, resetsAt: RESETS_AT });
    expect(html).toMatch(
      /<time class="coverage-notice__reset tabular-nums" dateTime="2026-10-09T00:00:00.000Z">2:00<\/time>/
    );
  });
});

describe('CoverageNotice — el error del job nunca se muestra', () => {
  it('un job fallido no muestra job.error (el variant ni siquiera lo recibe)', () => {
    const outcome = {
      kind: 'registered',
      job: {
        status: 'failed',
        attempts: 3,
        requestedAt: STARTED_AT,
        startedAt: STARTED_AT,
        error: 'ECONNRESET idealista 500',
      },
    } as const;
    const variant = noticeForOutcome(outcome, MUNICIPALITY, STARTED_AT);
    expect(variant).not.toBeNull();
    expect(render(variant as CoverageNoticeVariant)).not.toMatch(/ECONNRESET|idealista|500/);
  });
});

describe('CoverageNotice — fecha de inicio solo si existe', () => {
  it('un job en curso sin startedAt no menciona «Empezó»', () => {
    const html = render({
      kind: 'job',
      municipality: MUNICIPALITY,
      status: 'running',
      startedAt: null,
      retriesLeft: true,
    });
    expect(html).toMatch(/está en curso/);
    expect(html).not.toContain('Empezó');
  });
});

// P7 (pulido de D.21): la fecha de inicio es un `<time>` con su ISO para máquinas, en el detalle de los
// tres estados que la llevan; sin `startedAt` no hay ni frase ni elemento.
describe('CoverageNotice — fecha de inicio en un <time> que no se parte (P7)', () => {
  it.each(['running', 'done', 'failed'] as const)('el job %s envuelve la fecha en un <time>', (status) => {
    const html = render({ kind: 'job', municipality: MUNICIPALITY, status, startedAt: STARTED_AT, retriesLeft: false });

    expect(html.match(/<time /g)).toHaveLength(1);
    expect(html).toContain(
      '<time class="coverage-notice__date" dateTime="2026-10-08T12:05:00.000Z">8 oct 2026, 14:05</time>'
    );
    expect(visibleText(html)).toMatch(/Empezó el\s+8 oct 2026, 14:05\s*\./);
  });

  it('sin startedAt no hay <time> en el aviso del job', () => {
    for (const status of ['pending', 'running', 'done', 'failed'] as const) {
      const html = render({ kind: 'job', municipality: MUNICIPALITY, status, startedAt: null, retriesLeft: true });
      expect(html).not.toContain('<time');
    }
  });
});

// D.17 (B5): el estado del job no depende solo del color del borde; una etiqueta de texto lo repite
// de forma visible. Va oculta a la tecnología de apoyo porque el título de la región viva ya lo dice.
describe('CoverageNotice — etiqueta de estado del job (D.17, B5)', () => {
  it.each([
    ['pending', 'En cola'],
    ['running', 'En curso'],
    ['done', 'Terminada'],
    ['failed', 'Fallida'],
  ] as const)('el job %s lleva la etiqueta «%s», oculta a la tecnología de apoyo', (status, label) => {
    const html = render({ kind: 'job', municipality: MUNICIPALITY, status, startedAt: null, retriesLeft: true });

    expect(html).toContain(`<span class="coverage-notice__state" aria-hidden="true">${label}</span>`);
    expect(html.match(/coverage-notice__state/g)).toHaveLength(1);
  });

  it('las variantes que no son un job no llevan etiqueta de estado', () => {
    for (const variant of [
      { kind: 'registered-without-job', municipality: MUNICIPALITY },
      { kind: 'not-sweepable', municipality: MUNICIPALITY },
      { kind: 'outside-polygon' },
      { kind: 'unknown-zone' },
    ] as const) {
      expect(render(variant)).not.toContain('coverage-notice__state');
    }
  });
});

describe('noticeForOutcome', () => {
  const NOW = new Date('2026-10-08T12:05:00Z');

  it('covered no produce aviso', () => {
    expect(noticeForOutcome({ kind: 'covered' }, MUNICIPALITY, NOW)).toBeNull();
  });

  it('not-sweepable', () => {
    expect(noticeForOutcome({ kind: 'not-sweepable' }, MUNICIPALITY, NOW)).toEqual({
      kind: 'not-sweepable',
      municipality: MUNICIPALITY,
    });
  });

  it('los dos topes llevan la siguiente medianoche UTC como reinicio', () => {
    const expected = new Date('2026-10-09T00:00:00Z');
    expect(noticeForOutcome({ kind: 'cap-exhausted' }, MUNICIPALITY, NOW)).toEqual({
      kind: 'cap-exhausted',
      municipality: MUNICIPALITY,
      resetsAt: expected,
    });
    expect(noticeForOutcome({ kind: 'client-cap-exhausted' }, MUNICIPALITY, NOW)).toEqual({
      kind: 'client-cap-exhausted',
      municipality: MUNICIPALITY,
      resetsAt: expected,
    });
  });

  it('registered sin job produce V4', () => {
    expect(noticeForOutcome({ kind: 'registered', job: null }, MUNICIPALITY, NOW)).toEqual({
      kind: 'registered-without-job',
      municipality: MUNICIPALITY,
    });
  });

  it('registered con job produce la variante job con su estado e inicio', () => {
    const job = {
      status: 'running',
      attempts: 1,
      requestedAt: NOW,
      startedAt: STARTED_AT,
      error: null,
    } as const;
    expect(noticeForOutcome({ kind: 'registered', job }, MUNICIPALITY, NOW)).toEqual({
      kind: 'job',
      municipality: MUNICIPALITY,
      status: 'running',
      startedAt: STARTED_AT,
      retriesLeft: true,
    });
  });
});

// D.13b (decisión 184) — el aviso de un job `failed` depende de los intentos: con reintentos
// restantes promete volver a intentarlo y deja «Comprobar de nuevo»; agotados, lo dice sin
// rodeos y no ofrece ningún enlace (decisión 181: sin callejones sin salida).
describe('CoverageNotice — job fallido según los intentos (D.13b)', () => {
  const failed = (retriesLeft: boolean): CoverageNoticeVariant => ({
    kind: 'job',
    municipality: MUNICIPALITY,
    status: 'failed',
    startedAt: STARTED_AT,
    retriesLeft,
  });
  const failedOutcome = (attempts: number): Parameters<typeof noticeForOutcome>[0] => ({
    kind: 'registered',
    job: { status: 'failed', attempts, requestedAt: STARTED_AT, startedAt: STARTED_AT, error: null },
  });

  it('con reintentos: promete el reintento y es recargable', () => {
    const html = render(failed(true));
    expect(visibleText(html)).toContain('Lo volveremos a intentar más tarde');
    expect(visibleText(html)).toContain('«Comprobar de nuevo»');
    expect(isReloadable(failed(true))).toBe(true);
  });

  it('sin reintentos: no promete nada, dice que no se reintenta solo y no es recargable', () => {
    const html = render(failed(false));
    expect(visibleText(html)).toContain('No lo volveremos a intentar de forma automática');
    expect(visibleText(html)).toContain('prueba con un municipio cercano');
    expect(visibleText(html)).not.toMatch(/Lo volveremos a intentar más tarde|Comprobar de nuevo/);
    expect(html).toContain('role="alert"');
    expect(isReloadable(failed(false))).toBe(false);
  });

  it('los otros estados siguen siendo recargables aunque no quede ningún reintento', () => {
    for (const status of ['pending', 'running', 'done'] as const) {
      expect(
        isReloadable({ kind: 'job', municipality: MUNICIPALITY, status, startedAt: null, retriesLeft: false })
      ).toBe(true);
    }
  });

  it('noticeForOutcome: attempts por debajo del máximo deja reintentos y en el máximo no', () => {
    const base = { kind: 'job', municipality: MUNICIPALITY, status: 'failed', startedAt: STARTED_AT } as const;
    expect(noticeForOutcome(failedOutcome(COVERAGE_JOB_MAX_ATTEMPTS - 1), MUNICIPALITY, STARTED_AT)).toEqual({
      ...base,
      retriesLeft: true,
    });
    expect(noticeForOutcome(failedOutcome(COVERAGE_JOB_MAX_ATTEMPTS), MUNICIPALITY, STARTED_AT)).toEqual({
      ...base,
      retriesLeft: false,
    });
  });
});

// D.13b — voz de «nosotros» y tuteo: sin formas impersonales, y los dos topes con frases distintas.
describe('CoverageNotice — voz personal y topes distintos (D.13b)', () => {
  const global = visibleText(
    render({ kind: 'cap-exhausted', municipality: MUNICIPALITY, resetsAt: RESETS_AT })
  );
  const client = visibleText(
    render({ kind: 'client-cap-exhausted', municipality: MUNICIPALITY, resetsAt: RESETS_AT })
  );

  it('ninguna variante usa «Se ha»/«Se volverá»', () => {
    for (const { variant } of VARIANTS) {
      expect(visibleText(render(variant))).not.toMatch(/Se (ha|han|volverá)/);
    }
  });

  it('el límite diario global está en primera persona del plural', () => {
    expect(global).toContain('Hemos llegado al límite diario de zonas nuevas');
  });

  it('el tope por cliente conserva su frase propia, distinta de la global', () => {
    expect(client).toContain('Has alcanzado tu límite personal');
    expect(client).not.toContain('límite diario');
    expect(global).not.toContain('límite personal');
  });
});
