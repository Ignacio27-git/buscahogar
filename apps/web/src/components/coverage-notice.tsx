// D.13 (decisión 181) — aviso único de cobertura: renderiza las 10 variantes
// (zona desconocida, polígono fuera de cobertura, municipio no barrible, los
// dos topes diarios, solicitud registrada y los cuatro estados del job).
//
// Componente de SERVIDOR (sin `'use client'`: el allowlist de
// `no-client-directive.test.ts` no crece). Es la ÚNICA región viva de la
// sección de cobertura: un nodo estable con `aria-atomic` explícito que nunca
// lleva `key`, para que, tras `router.refresh()`, el texto cambie dentro del
// mismo nodo y se anuncie. Solo `failed` usa `role="alert"` (en el mismo nodo).
// Limitación aceptada: un `failed` que ya viene en el HTML inicial no se
// anuncia (anunciarlo exigiría un efecto de cliente).
//
// Sin ISO, sin «UTC», sin «barrido» y sin `job.error`: el texto habla de
// «actualización de la zona» y tutea (decisión 134). La hora de reinicio se
// muestra en hora de Madrid y sin palabra de día («mañana»/«hoy»): entre las
// 00:00 y las 02:00 de Madrid el reinicio cae aún en el mismo día natural.
import type { ReactElement, ReactNode } from 'react';

import { hasRetriesLeft } from '@buscahogar/core';
import type { CoverageJobState } from '@buscahogar/db';

import { formatMadridDateTime, formatMadridTime, nextUtcMidnight } from '@/lib/madrid-time';
import type { CoverageOutcome } from '@/server/coverage';

export type CoverageNoticeVariant =
  | { readonly kind: 'unknown-zone' }
  | { readonly kind: 'outside-polygon' }
  | { readonly kind: 'not-sweepable' | 'registered-without-job'; readonly municipality: string }
  | {
      readonly kind: 'cap-exhausted' | 'client-cap-exhausted';
      readonly municipality: string;
      readonly resetsAt: Date;
    }
  | {
      readonly kind: 'job';
      readonly municipality: string;
      readonly status: CoverageJobState['status'];
      readonly startedAt: Date | null;
      // Solo importa en `failed` (D.13b, decisión 184): ¿el worker volverá a coger el job?
      readonly retriesLeft: boolean;
    };

// Traduce el resultado de cobertura a su variante. `covered` no lleva aviso.
// Solo cubre los `kind` de `CoverageOutcome`; zona desconocida y polígono se
// construyen con literales en `page.tsx`.
export function noticeForOutcome(
  outcome: CoverageOutcome,
  municipality: string,
  now: Date
): CoverageNoticeVariant | null {
  switch (outcome.kind) {
    case 'covered':
      return null;
    case 'not-sweepable':
      return { kind: 'not-sweepable', municipality };
    case 'cap-exhausted':
    case 'client-cap-exhausted':
      return { kind: outcome.kind, municipality, resetsAt: nextUtcMidnight(now) };
    case 'registered':
      return outcome.job === null
        ? { kind: 'registered-without-job', municipality }
        : {
            kind: 'job',
            municipality,
            status: outcome.job.status,
            startedAt: outcome.job.startedAt,
            retriesLeft: hasRetriesLeft(outcome.job.attempts),
          };
  }
}

// Recargar solo puede cambiar el estado cuando hay una solicitud en marcha. En los otros casos el
// enlace sería un callejón sin salida, también en un job `failed` sin reintentos (D.13b): el
// worker no volverá a cogerlo, así que recargar nunca lo cambia.
export function isReloadable(variant: CoverageNoticeVariant): boolean {
  if (variant.kind === 'job') return variant.status !== 'failed' || variant.retriesLeft;
  return variant.kind === 'registered-without-job';
}

interface NoticeCopy {
  readonly role: 'status' | 'alert';
  readonly title: string;
  readonly detail: ReactNode;
  // D.17 (B5): etiqueta corta del estado de un job; el borde de color no es la única señal.
  readonly stateLabel?: string;
}

function resetTime(resetsAt: Date): ReactElement {
  return (
    <time className="coverage-notice__reset tabular-nums" dateTime={resetsAt.toISOString()}>
      {formatMadridTime(resetsAt)}
    </time>
  );
}

// P7 (pulido de D.21): la fecha va en un `<time>` con `white-space: nowrap` (CSS) para que a 320px no se
// parta entre el día y el mes; el ISO de `dateTime` es para máquinas y no se ve.
function startedSentence(startedAt: Date | null): ReactNode {
  if (startedAt === null) return null;
  return (
    <>
      Empezó el{' '}
      <time className="coverage-notice__date" dateTime={startedAt.toISOString()}>
        {formatMadridDateTime(startedAt)}
      </time>
      .
    </>
  );
}

function copyFor(variant: CoverageNoticeVariant): NoticeCopy {
  switch (variant.kind) {
    case 'unknown-zone':
      return {
        role: 'status',
        title: 'El enlace lleva un municipio que no existe.',
        detail: 'Escribe el nombre del municipio en el buscador.',
      };
    case 'outside-polygon':
      return {
        role: 'status',
        title: 'No hay viviendas en la zona dibujada.',
        detail:
          'Puede que la zona aún no esté cubierta. Dibujar una zona no pide su actualización.',
      };
    case 'not-sweepable':
      return {
        role: 'status',
        title: `Todavía no hay viviendas de ${variant.municipality}.`,
        detail:
          'Falta la ubicación del municipio, así que no puedes pedir la actualización de la zona. Prueba con un municipio cercano.',
      };
    case 'cap-exhausted':
      return {
        role: 'status',
        title: `Todavía no hay viviendas de ${variant.municipality}.`,
        detail: (
          <>
            Hemos llegado al límite diario de zonas nuevas. Vuelve a buscar {variant.municipality}{' '}
            a partir de las {resetTime(variant.resetsAt)} de la madrugada para pedir la
            actualización de la zona.
          </>
        ),
      };
    case 'client-cap-exhausted':
      return {
        role: 'status',
        title: `Todavía no hay viviendas de ${variant.municipality}.`,
        detail: (
          <>
            Has alcanzado tu límite personal de zonas nuevas. Vuelve a buscar {variant.municipality}{' '}
            a partir de las {resetTime(variant.resetsAt)} de la madrugada para pedirla.
          </>
        ),
      };
    case 'registered-without-job':
      return {
        role: 'status',
        title: `Tu solicitud de actualización de ${variant.municipality} está registrada.`,
        detail: 'Pulsa «Comprobar de nuevo» en unos minutos para ver cómo va.',
      };
    case 'job':
      return jobCopy(variant);
  }
}

function jobCopy(variant: Extract<CoverageNoticeVariant, { kind: 'job' }>): NoticeCopy {
  const started = startedSentence(variant.startedAt);
  switch (variant.status) {
    case 'pending':
      return {
        role: 'status',
        title: `La actualización de ${variant.municipality} está en cola.`,
        detail: 'Las viviendas aparecerán en esta lista cuando termine.',
        stateLabel: 'En cola',
      };
    case 'running':
      return {
        role: 'status',
        title: `La actualización de ${variant.municipality} está en curso.`,
        detail: (
          <>
            {started}
            {started !== null ? ' ' : null}
            Las viviendas aparecerán en esta lista cuando termine.
          </>
        ),
        stateLabel: 'En curso',
      };
    case 'done':
      return {
        role: 'status',
        title: `La actualización de ${variant.municipality} ha terminado.`,
        detail: (
          <>
            {started}
            {started !== null ? ' ' : null}
            Pulsa «Comprobar de nuevo» si aún no ves sus viviendas.
          </>
        ),
        stateLabel: 'Terminada',
      };
    case 'failed':
      return {
        role: 'alert',
        title: `La actualización de ${variant.municipality} ha fallado.`,
        detail: (
          <>
            {variant.retriesLeft
              ? 'Lo volveremos a intentar más tarde; pulsa «Comprobar de nuevo» dentro de un rato.'
              : 'No lo volveremos a intentar de forma automática. Mientras tanto, prueba con un municipio cercano.'}
            {started !== null ? ' ' : null}
            {started}
          </>
        ),
        stateLabel: 'Fallida',
      };
  }
}

export function CoverageNotice({
  variant,
}: {
  readonly variant: CoverageNoticeVariant;
}): ReactElement {
  const { role, title, detail, stateLabel } = copyFor(variant);
  return (
    <div className="coverage-notice" role={role} aria-atomic="true">
      <p className="coverage-notice__title">
        {title}
        {/* Oculta a la tecnología de apoyo: el título de esta región viva ya dice el estado. */}
        {stateLabel !== undefined ? (
          <>
            {' '}
            <span className="coverage-notice__state" aria-hidden="true">
              {stateLabel}
            </span>
          </>
        ) : null}
      </p>
      <p className="coverage-notice__detail">{detail}</p>
    </div>
  );
}
