// ROADMAP 3.4 (decisión 259, D17; R7.3, R7.4) — selección PURA de los avisos a enviar en un tick:
// enfriamiento por clave (con el último envío leído de la base), tope de mensajes por tick, resumen "+N más"
// del exceso y respeto del presupuesto de llamadas salientes compartido con el latido.
import { describe, expect, it } from 'vitest';

import type { AlertCandidate } from '../src/alerts/checks.js';
import { selectAlertsToSend } from '../src/alerts/throttle.js';

const NOW = new Date('2026-10-22T10:00:00.000Z');
const HOUR = 3_600_000;

function candidate(key: string, overrides: Partial<AlertCandidate> = {}): AlertCandidate {
  return { dedupKey: key, severity: 'warning', text: `aviso ${key}`, cooldownMs: HOUR, ...overrides };
}

const OPTIONS = { maxPerTick: 3, slots: 4 };

describe('selectAlertsToSend — enfriamiento y deduplicación', () => {
  it('sin candidatos no hay mensajes', () => {
    expect(selectAlertsToSend([], new Map(), NOW, OPTIONS)).toEqual({ messages: [], suppressed: [], folded: 0 });
  });

  it('un candidato sin envío previo se envía con su clave para registrar', () => {
    const selection = selectAlertsToSend([candidate('a')], new Map(), NOW, OPTIONS);

    expect(selection.messages).toEqual([{ text: 'aviso a', dedupKeys: ['a'] }]);
    expect(selection.suppressed).toEqual([]);
  });

  it('dentro del enfriamiento no se reenvía (persistido: p. ej. tras un reinicio) y se informa como suprimido', () => {
    const lastSent = new Map([['a', new Date(NOW.getTime() - 30 * 60_000)]]);

    const selection = selectAlertsToSend([candidate('a'), candidate('b')], lastSent, NOW, OPTIONS);

    expect(selection.messages.map((message) => message.dedupKeys)).toEqual([['b']]);
    expect(selection.suppressed).toEqual(['a']);
  });

  it('en el instante exacto en que vence el enfriamiento vuelve a enviarse; un instante antes, no', () => {
    const exact = new Map([['a', new Date(NOW.getTime() - HOUR)]]);
    const before = new Map([['a', new Date(NOW.getTime() - HOUR + 1)]]);

    expect(selectAlertsToSend([candidate('a')], exact, NOW, OPTIONS).messages).toHaveLength(1);
    expect(selectAlertsToSend([candidate('a')], before, NOW, OPTIONS).messages).toHaveLength(0);
  });

  it('un último envío en el futuro (reloj desfasado) cuenta como dentro del enfriamiento', () => {
    const lastSent = new Map([['a', new Date(NOW.getTime() + 60_000)]]);
    expect(selectAlertsToSend([candidate('a')], lastSent, NOW, OPTIONS).messages).toHaveLength(0);
  });

  it('cada candidato usa SU enfriamiento y las claves repetidas se colapsan', () => {
    const lastSent = new Map([
      ['corto', new Date(NOW.getTime() - 2 * HOUR)],
      ['largo', new Date(NOW.getTime() - 2 * HOUR)],
    ]);

    const selection = selectAlertsToSend(
      [
        candidate('corto', { cooldownMs: HOUR }),
        candidate('largo', { cooldownMs: 24 * HOUR }),
        candidate('corto', { cooldownMs: HOUR }),
      ],
      lastSent,
      NOW,
      OPTIONS
    );

    expect(selection.messages.map((message) => message.dedupKeys)).toEqual([['corto']]);
    expect(selection.suppressed).toEqual(['largo']);
  });
});

describe('selectAlertsToSend — tope por tick y resumen', () => {
  it('hasta el tope se envían todos, los críticos primero y luego por clave', () => {
    const selection = selectAlertsToSend(
      [candidate('z', { severity: 'info' }), candidate('b'), candidate('a', { severity: 'critical' })],
      new Map(),
      NOW,
      OPTIONS
    );

    expect(selection.messages.map((message) => message.dedupKeys[0])).toEqual(['a', 'b', 'z']);
    expect(selection.folded).toBe(0);
  });

  it('por encima del tope: tope-1 mensajes + UN resumen "+N más" sin claves que registrar', () => {
    const many = Array.from({ length: 10 }, (_, index) => candidate(`k${String(index).padStart(2, '0')}`));

    const selection = selectAlertsToSend(many, new Map(), NOW, OPTIONS);

    expect(selection.messages).toHaveLength(3);
    expect(selection.messages.slice(0, 2).map((message) => message.dedupKeys)).toEqual([['k00'], ['k01']]);
    const summary = selection.messages[2];
    expect(summary?.dedupKeys).toEqual([]);
    expect(summary?.text).toContain('+8');
    expect(selection.folded).toBe(8);
  });

  it('las claves plegadas en el resumen NO se registran: se reintentan en el siguiente tick', () => {
    const many = Array.from({ length: 5 }, (_, index) => candidate(`k${String(index)}`));
    const first = selectAlertsToSend(many, new Map(), NOW, OPTIONS);
    const sent = new Map(first.messages.flatMap((message) => message.dedupKeys).map((key) => [key, NOW] as const));

    const second = selectAlertsToSend(many, sent, NOW, OPTIONS);

    expect(second.messages.map((message) => message.dedupKeys[0])).toEqual(['k2', 'k3', 'k4']);
    expect(second.folded).toBe(0);
  });

  it('el presupuesto de salida restante acota los mensajes aunque el tope por tick sea mayor', () => {
    const selection = selectAlertsToSend(
      [candidate('a'), candidate('b'), candidate('c')],
      new Map(),
      NOW,
      { maxPerTick: 3, slots: 2 }
    );

    expect(selection.messages).toHaveLength(2);
    expect(selection.messages[0]?.dedupKeys).toEqual(['a']);
    expect(selection.messages[1]?.dedupKeys).toEqual([]);
    expect(selection.folded).toBe(2);
  });

  it('con una sola plaza y varios avisos solo cabe el resumen', () => {
    const selection = selectAlertsToSend([candidate('a'), candidate('b')], new Map(), NOW, {
      maxPerTick: 3,
      slots: 1,
    });

    expect(selection.messages).toHaveLength(1);
    expect(selection.messages[0]?.dedupKeys).toEqual([]);
    expect(selection.folded).toBe(2);
  });

  it('con una sola plaza y un solo aviso se envía tal cual', () => {
    const selection = selectAlertsToSend([candidate('a')], new Map(), NOW, { maxPerTick: 3, slots: 1 });
    expect(selection.messages).toEqual([{ text: 'aviso a', dedupKeys: ['a'] }]);
  });

  it('sin plazas (presupuesto agotado o tope 0) no se envía nada, ni siquiera el resumen', () => {
    for (const options of [
      { maxPerTick: 3, slots: 0 },
      { maxPerTick: 0, slots: 4 },
    ]) {
      const selection = selectAlertsToSend([candidate('a'), candidate('b')], new Map(), NOW, options);
      expect(selection.messages).toEqual([]);
      expect(selection.folded).toBe(2);
    }
  });

  it('rechaza opciones no enteras o negativas', () => {
    expect(() => selectAlertsToSend([], new Map(), NOW, { maxPerTick: -1, slots: 4 })).toThrow(/entero/);
    expect(() => selectAlertsToSend([], new Map(), NOW, { maxPerTick: 3, slots: 1.5 })).toThrow(/entero/);
  });
});
