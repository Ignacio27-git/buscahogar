// ROADMAP 1.15 (security-hardening, spec #261 "Client Network Identity...",
// diseño decisión 075) — resolución del valor CRUDO de la cabecera confiable
// a una IP válida o `null`. Fail-closed por construcción: cualquier entrada
// que no sea EXACTAMENTE una IPv4/IPv6 bien formada (ausente, lista separada
// por comas, basura) devuelve `null` — nunca lanza, nunca "adivina" la
// primera IP de una lista. El llamador (PR2, proxy-rate-limit.ts /
// coverage-client.ts) es quien decide `parseTrustedClientIp(header) ??
// UNKNOWN_CLIENT_IDENTITY`, así que este módulo nunca conoce el bucket
// 'unknown' por sí mismo, solo lo declara como constante compartida.
import { describe, expect, it } from 'vitest';

import { parseTrustedClientIp, UNKNOWN_CLIENT_IDENTITY } from '../src/rate-limit/client-ip.js';

describe('parseTrustedClientIp — IPv4/IPv6 bien formadas', () => {
  it('acepta una IPv4 bien formada tal cual', () => {
    expect(parseTrustedClientIp('203.0.113.5')).toBe('203.0.113.5');
  });

  it('acepta una IPv6 bien formada tal cual', () => {
    expect(parseTrustedClientIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('recorta espacios en blanco alrededor de una IP por lo demás válida', () => {
    expect(parseTrustedClientIp('  203.0.113.5  ')).toBe('203.0.113.5');
  });
});

describe('parseTrustedClientIp — entradas inválidas resuelven a null, nunca lanzan', () => {
  it('una cabecera ausente (null) resuelve a null', () => {
    expect(parseTrustedClientIp(null)).toBeNull();
  });

  it('una cabecera vacía resuelve a null', () => {
    expect(parseTrustedClientIp('')).toBeNull();
  });

  it('una lista separada por comas (varios saltos intermedios) resuelve a null — nunca se adivina la primera', () => {
    expect(parseTrustedClientIp('203.0.113.5, 198.51.100.7')).toBeNull();
  });

  it('un valor que no es una IP en absoluto resuelve a null', () => {
    expect(parseTrustedClientIp('no-es-una-ip')).toBeNull();
  });

  it('una IPv4 con un octeto fuera de rango resuelve a null', () => {
    expect(parseTrustedClientIp('999.0.0.1')).toBeNull();
  });
});

describe('UNKNOWN_CLIENT_IDENTITY', () => {
  it('es la cadena literal "unknown", el bucket compartido para identidad no resoluble', () => {
    expect(UNKNOWN_CLIENT_IDENTITY).toBe('unknown');
  });
});
