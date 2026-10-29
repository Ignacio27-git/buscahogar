// D.16 (specs map-motion MM-3..MM-6, S-MM-2..S-MM-6 y S-MM-8, decisión 206) — parche del teclado de
// Leaflet. Dos capas: casos unitarios con un doble que reproduce la forma de `Keyboard` y de `Map`
// (métodos en el prototipo, conjunto de oyentes de `document`), y un bloque de contrato que lee el
// código de Leaflet 1.9.4 y falla en voz alta si el miembro privado que usa el parche cambia.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Map as LeafletMap } from 'leaflet';
import { describe, expect, it } from 'vitest';

import { makeKeyboardInstant } from '../src/components/map-instant-keyboard';

interface Call {
  readonly arg: unknown;
  readonly options: Record<string, unknown> | undefined;
}

type Options = Record<string, unknown> | undefined;
type Listener = (this: FakeKeyboard, event: { key: string }) => void;

/** Métodos del prototipo del doble de `Map` (en Leaflet viven en el prototipo, no en la instancia). */
interface MapProto {
  panBy: (this: object, arg: unknown, options?: Options) => void;
  setZoom: (this: object, arg: unknown, options?: Options) => void;
}

interface FakeKeyboard {
  _map: MapProto;
  _focused: boolean;
  _enabled: boolean;
  _onKeyDown: unknown;
  _addHooks: () => void;
  _removeHooks: () => void;
  enabled: () => boolean;
  enable: () => void;
  disable: () => void;
}

interface Fake {
  map: LeafletMap;
  keyboard: FakeKeyboard;
  keyboardProto: { _onKeyDown: unknown };
  panByCalls: Call[];
  setZoomCalls: Call[];
  log: string[];
  failNextEvent: () => void;
  press: (key: string) => void;
  listenerCount: () => number;
}

/** Doble de `map.keyboard` + `Map`: métodos en el prototipo y conjunto de oyentes de la página. */
function createFake(init: { focused: boolean; enabled: boolean } = { focused: false, enabled: true }): Fake {
  const panByCalls: Call[] = [];
  const setZoomCalls: Call[] = [];
  const log: string[] = [];
  // Oyentes de la página con su contexto, igual que `on(document, 'keydown', fn, ctx)`.
  const listeners = new Map<Listener, FakeKeyboard>();
  let throwNext = false;

  const mapProto: MapProto = {
    panBy: (arg, options): void => {
      panByCalls.push({ arg, options });
    },
    setZoom: (arg, options): void => {
      setZoomCalls.push({ arg, options });
    },
  };
  const map = Object.create(mapProto) as MapProto & { keyboard?: FakeKeyboard };

  const keyboardProto: Omit<FakeKeyboard, '_map' | '_focused' | '_enabled'> & {
    _onKeyDown: Listener;
  } = {
    _onKeyDown(this: FakeKeyboard, event): void {
      if (throwNext) throw new Error('fallo del manejador');
      if (event.key === 'ArrowRight') this._map.panBy([80, 0]);
      else if (event.key === '+') this._map.setZoom(7);
    },
    _addHooks(this: FakeKeyboard): void {
      log.push('_addHooks');
      listeners.set(this._onKeyDown as Listener, this);
    },
    _removeHooks(this: FakeKeyboard): void {
      listeners.delete(this._onKeyDown as Listener);
    },
    enabled(this: FakeKeyboard): boolean {
      return this._enabled;
    },
    enable(this: FakeKeyboard): void {
      log.push('enable');
      this._enabled = true;
    },
    disable(this: FakeKeyboard): void {
      log.push('disable');
      this._enabled = false;
      this._removeHooks();
    },
  };
  const keyboard = Object.create(keyboardProto) as FakeKeyboard;
  keyboard._map = map;
  keyboard._focused = init.focused;
  keyboard._enabled = init.enabled;
  map.keyboard = keyboard;
  // Un teclado enfocado y habilitado ya tiene su manejador enlazado a la página.
  if (init.focused && init.enabled) keyboard._addHooks();
  log.length = 0;

  return {
    map: map as unknown as LeafletMap,
    keyboard,
    keyboardProto,
    panByCalls,
    setZoomCalls,
    log,
    failNextEvent: (): void => {
      throwNext = true;
    },
    press: (key: string): void => {
      for (const [listener, context] of [...listeners]) listener.call(context, { key });
    },
    listenerCount: (): number => listeners.size,
  };
}

describe('makeKeyboardInstant — pan y zoom instantáneos solo durante la tecla (S-MM-2..4)', () => {
  it('panBy recibe animate:false mezclado con las opciones del llamante', () => {
    const fake = createFake({ focused: true, enabled: true });
    makeKeyboardInstant(fake.map);
    fake.press('ArrowRight');
    expect(fake.panByCalls).toEqual([{ arg: [80, 0], options: { animate: false } }]);
  });

  it('setZoom recibe animate:false al pulsar +', () => {
    const fake = createFake({ focused: true, enabled: true });
    makeKeyboardInstant(fake.map);
    fake.press('+');
    expect(fake.setZoomCalls).toEqual([{ arg: 7, options: { animate: false } }]);
  });

  it('conserva las opciones del llamante y deja animate:false por encima de ellas', () => {
    const fake = createFake({ focused: false, enabled: true });
    fake.keyboardProto._onKeyDown = function (this: FakeKeyboard): void {
      this._map.panBy([1, 2], { duration: 0.5, animate: true });
    };
    makeKeyboardInstant(fake.map);
    fake.keyboard._addHooks();
    fake.press('ArrowRight');
    expect(fake.panByCalls).toEqual([{ arg: [1, 2], options: { duration: 0.5, animate: false } }]);
  });

  it('fuera de la tecla, panBy y setZoom son los originales y no reciben opciones', () => {
    const fake = createFake({ focused: true, enabled: true });
    makeKeyboardInstant(fake.map);
    fake.press('ArrowRight');
    const afterKey = fake.map as unknown as {
      panBy: (a: unknown) => void;
      setZoom: (a: unknown) => void;
    };
    afterKey.panBy([5, 5]);
    afterKey.setZoom(3);
    expect(fake.panByCalls[1]).toEqual({ arg: [5, 5], options: undefined });
    expect(fake.setZoomCalls).toEqual([{ arg: 3, options: undefined }]);
    expect(Object.hasOwn(fake.map, 'panBy')).toBe(false);
    expect(Object.hasOwn(fake.map, 'setZoom')).toBe(false);
  });

  it('restaura panBy y setZoom aunque el manejador lance', () => {
    const fake = createFake({ focused: true, enabled: true });
    makeKeyboardInstant(fake.map);
    fake.failNextEvent();
    expect(() => {
      fake.press('ArrowRight');
    }).toThrow('fallo del manejador');
    expect(Object.hasOwn(fake.map, 'panBy')).toBe(false);
    expect(Object.hasOwn(fake.map, 'setZoom')).toBe(false);
  });
});

describe('makeKeyboardInstant — reenganche del manejador (R4, N2)', () => {
  it('con el mapa enfocado: disable antes de enable y vuelve a enlazar el manejador parcheado', () => {
    const fake = createFake({ focused: true, enabled: true });
    const original = fake.keyboardProto._onKeyDown;
    makeKeyboardInstant(fake.map);
    expect(fake.log).toEqual(['disable', 'enable', '_addHooks']);
    expect(fake.keyboard._onKeyDown).not.toBe(original);
    expect(fake.listenerCount()).toBe(1);
  });

  it('sin foco: no llama a _addHooks (el enlace lo hará el evento de foco)', () => {
    const fake = createFake({ focused: false, enabled: true });
    makeKeyboardInstant(fake.map);
    expect(fake.log).toEqual(['disable', 'enable']);
    expect(fake.listenerCount()).toBe(0);
  });

  it('con el teclado deshabilitado: parchea sin disable ni enable y sin habilitarlo', () => {
    const fake = createFake({ focused: false, enabled: false });
    makeKeyboardInstant(fake.map);
    expect(fake.log).toEqual([]);
    expect(fake.keyboard._enabled).toBe(false);
    expect(Object.hasOwn(fake.keyboard, '_onKeyDown')).toBe(true);
  });
});

describe('makeKeyboardInstant — limpieza (S-MM-5)', () => {
  it('restaura el manejador del prototipo, deja el teclado habilitado y reenlaza si hay foco', () => {
    const fake = createFake({ focused: true, enabled: true });
    const original = fake.keyboardProto._onKeyDown;
    const cleanup = makeKeyboardInstant(fake.map);
    fake.log.length = 0;
    cleanup();
    expect(fake.keyboard._onKeyDown).toBe(original);
    expect(Object.hasOwn(fake.keyboard, '_onKeyDown')).toBe(false);
    expect(fake.keyboard._enabled).toBe(true);
    expect(fake.log).toEqual(['disable', 'enable', '_addHooks']);
    expect(fake.listenerCount()).toBe(1);
    fake.press('ArrowRight');
    expect(fake.panByCalls).toEqual([{ arg: [80, 0], options: undefined }]);
  });

  it('sin foco no reenlaza, y una segunda limpieza no hace nada', () => {
    const fake = createFake({ focused: false, enabled: true });
    const cleanup = makeKeyboardInstant(fake.map);
    fake.log.length = 0;
    cleanup();
    expect(fake.log).toEqual(['disable', 'enable']);
    cleanup();
    expect(fake.log).toEqual(['disable', 'enable']);
  });

  it('montar, limpiar y volver a montar (StrictMode) deja un solo manejador activo', () => {
    const fake = createFake({ focused: true, enabled: true });
    makeKeyboardInstant(fake.map)();
    makeKeyboardInstant(fake.map);
    expect(fake.listenerCount()).toBe(1);
    fake.press('ArrowRight');
    expect(fake.panByCalls).toEqual([{ arg: [80, 0], options: { animate: false } }]);
  });
});

describe('makeKeyboardInstant — degradación segura (S-MM-6)', () => {
  it('sin map.keyboard no lanza y devuelve una limpieza que no hace nada', () => {
    const bare = {} as unknown as LeafletMap;
    const cleanup = makeKeyboardInstant(bare);
    expect(() => {
      cleanup();
    }).not.toThrow();
    expect(Object.keys(bare)).toEqual([]);
  });

  it('con _onKeyDown que no es una función no parchea nada', () => {
    const fake = createFake({ focused: true, enabled: true });
    fake.keyboardProto._onKeyDown = 'no soy una función';
    const cleanup = makeKeyboardInstant(fake.map);
    expect(fake.log).toEqual([]);
    expect(Object.hasOwn(fake.keyboard, '_onKeyDown')).toBe(false);
    expect(() => {
      cleanup();
    }).not.toThrow();
  });
});

// Contrato con Leaflet (R1, S-MM-8): el parche depende de miembros privados de la 1.9.4. Se lee el
// fichero que devuelve `require.resolve('leaflet')` (dist/leaflet-src.js) y, por separado, la
// ruta ESM explícita que empaqueta el navegador; nunca se usa el campo `module` del paquete.
describe('contrato con Leaflet 1.9.4 (MM-6, S-MM-8)', () => {
  const require = createRequire(import.meta.url);
  const leafletEntry = require.resolve('leaflet');
  const esmEntry = join(dirname(leafletEntry), 'leaflet-src.esm.js');

  it('apps/web/package.json fija leaflet exactamente en 1.9.4 y está instalada esa versión', () => {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.leaflet).toBe('1.9.4');
    const installed = require('leaflet/package.json') as { version: string };
    expect(installed.version).toBe('1.9.4');
  });

  const PRIVATE_API = [
    "on(document, 'keydown', this._onKeyDown, this)",
    'map.panBy(offset)',
    'map.setZoom(map.getZoom()',
    '_addHooks: function',
    'this._focused = true',
  ];

  it.each([
    ['dist/leaflet-src.js (require.resolve)', leafletEntry],
    ['dist/leaflet-src.esm.js (ruta explícita)', esmEntry],
  ])('%s contiene los miembros privados que usa el parche', (_label, file) => {
    const source = readFileSync(file, 'utf8');
    for (const fragment of PRIVATE_API) expect(source, fragment).toContain(fragment);
  });
});
