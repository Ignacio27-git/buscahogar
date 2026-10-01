// Sonda de la API de Idealista (paso 1.5) — contador de peticiones.
//
// El tope duro es lo que convierte "creemos que no hay una segunda llamada"
// en "una segunda llamada es imposible sin una excepción no capturada"
// (REQ-QUOTA). `spend` se llama siempre antes del `fetch` correspondiente,
// así que una petición fallida cuenta igual que una exitosa (REQ-COUNT).
import { describe, expect, it } from 'vitest';

import { createRequestLedger, renderLedgerReport } from '../scripts/probe/ledger.js';

describe('createRequestLedger', () => {
  it('permite un gasto de "token" y uno de "search", reflejados en el snapshot', () => {
    const ledger = createRequestLedger();

    ledger.spend('token');
    ledger.spend('search');

    expect(ledger.snapshot()).toEqual({ token: 1, search: 1 });
  });

  it('lanza en un segundo gasto de "search": tope duro de 1 por tipo', () => {
    const ledger = createRequestLedger();
    ledger.spend('search');

    expect(() => {
      ledger.spend('search');
    }).toThrow();
  });

  it('lanza en un segundo gasto de "token": tope duro de 1 por tipo', () => {
    const ledger = createRequestLedger();
    ledger.spend('token');

    expect(() => {
      ledger.spend('token');
    }).toThrow();
  });
});

describe('renderLedgerReport', () => {
  it('muestra el conteo de token y de búsqueda en líneas separadas, nunca mezclados, y marca el impacto del token como DESCONOCIDO', () => {
    const report = renderLedgerReport({ token: 1, search: 1 }, 'ok');

    expect(report).toContain('token');
    expect(report).toContain('búsqueda');
    expect(report).toContain('DESCONOCIDO');
    // Cada contador aparece en su propia línea, no como una única cifra combinada.
    const tokenLine = report.split('\n').find((line) => line.includes('token'));
    const searchLine = report.split('\n').find((line) => line.includes('búsqueda'));
    expect(tokenLine).toBeDefined();
    expect(searchLine).toBeDefined();
    expect(tokenLine).not.toBe(searchLine);
    // El informe no debe presentar NINGUNA cifra agregada de token + búsqueda:
    // no está documentado si la petición de token consume cuota de búsqueda, así
    // que sumarlas afirmaría algo que no sabemos. Quien lea en diagonal un
    // "Total: 2" concluiría que ha gastado dos búsquedas.
    expect(report).not.toMatch(/total/i);
  });

  it('en el caso de error incluye el bloque AVISO indicando que la petición pudo facturarse igualmente', () => {
    const report = renderLedgerReport({ token: 1, search: 1 }, 'error');

    expect(report).toContain('AVISO');
    expect(report).toMatch(/facturad[oa]/i);
  });

  it('en el caso ok no incluye el bloque AVISO', () => {
    const report = renderLedgerReport({ token: 1, search: 1 }, 'ok');

    expect(report).not.toContain('AVISO');
  });
});

// ROADMAP 2.5 (refresh-retention-policy, S3; decisión 105, U3) — el tope de la
// sonda pasa a ser configurable SIN cambiar el valor por defecto (1): la sonda
// de `adIds` hace hasta 3 peticiones de búsqueda facturables y nada más.
describe('createRequestLedger — tope configurable (S-LR-21)', () => {
  it('por defecto el tope sigue siendo 1 por tipo (la sonda original no cambia)', () => {
    const ledger = createRequestLedger();
    ledger.spend('search');

    expect(() => {
      ledger.spend('search');
    }).toThrow(/máximo 1/);
  });

  it('con tope de búsqueda 3 se permiten tres y la CUARTA se rechaza antes de contarse', () => {
    const ledger = createRequestLedger({ search: 3 });
    ledger.spend('search');
    ledger.spend('search');
    ledger.spend('search');

    expect(() => {
      ledger.spend('search');
    }).toThrow(/máximo 3/);
    expect(ledger.snapshot()).toEqual({ token: 0, search: 3 });
  });

  it('el tope de búsqueda configurado NO relaja el de token: sigue en 1 salvo que se configure', () => {
    const ledger = createRequestLedger({ search: 3 });
    ledger.spend('token');

    expect(() => {
      ledger.spend('token');
    }).toThrow(/máximo 1/);
  });

  it('un tope de token configurado se respeta por separado', () => {
    const ledger = createRequestLedger({ token: 2 });
    ledger.spend('token');
    ledger.spend('token');

    expect(() => {
      ledger.spend('token');
    }).toThrow(/máximo 2/);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'un tope inválido (%s) se rechaza al construir el contador: nunca un tope implícito ni ilimitado',
    (cap) => {
      expect(() => createRequestLedger({ search: cap })).toThrow(RangeError);
    }
  );
});
