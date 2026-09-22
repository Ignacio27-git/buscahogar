// ROADMAP 1.13 Unit D (diseño DD-23, arbitraje CR-9) — política PURA del
// polling del estado de un barrido: `coverage-status.tsx` (el único
// componente `'use client'` de este cambio) delega aquí la decisión de
// seguir refrescando, para que sea comprobable sin `useRouter()` ni jsdom.
// Acotado por DOS motivos independientes (DD-18/DD-23): un estado TERMINAL
// (done/failed) detiene el refresco — no hay nada más que esperar — y un
// TECHO de refrescos detiene un job atascado en pending/running para
// siempre, en vez de refrescar indefinidamente.
export type CoverageJobStatus = 'pending' | 'running' | 'done' | 'failed';

// Intervalo/techo son constantes de servidor (mismo principio que
// `PAGE_SIZE` en `packages/db/src/search.ts`): nunca un parámetro de URL ni
// una prop configurable por el llamador.
export const REFRESH_INTERVAL_MS = 5_000;
export const MAX_REFRESH_COUNT = 24; // 24 × 5s = 2 minutos de refresco antes de detenerse

export function shouldKeepRefreshing(status: CoverageJobStatus, refreshCount: number): boolean {
  if (status === 'done' || status === 'failed') {
    return false;
  }
  return refreshCount < MAX_REFRESH_COUNT;
}
