// ROADMAP 1.13 Unit D (diseño DD-23, arbitraje CR-8/CR-9) — el ÚNICO
// componente `'use client'` de este cambio (DD-19: la lista de sugerencias
// de zona no necesita JavaScript en absoluto). `useRouter().refresh()` en
// vez de un endpoint de estado propio: nada de Route Handler, nada de
// contrato JSON, nada de tercera frontera Zod — y es mejor producto: el
// usuario espera VIVIENDAS nuevas, y `router.refresh()` vuelve a ejecutar
// el Server Component, así que los resultados mismos aparecen cuando el
// barrido termina, en vez de un JSON que diga "listo" y exija otra acción.
//
// El baseline SIN JavaScript es completo (D8/A-7): `page.tsx` ya renderiza
// el estado del job y un enlace de recarga plano en su propia rama
// server-rendered, ANTES de este componente — este componente es una
// MEJORA (refresco automático), nunca la única vía de ver el estado.
'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';

import type { CoverageJobState } from '@buscahogar/db';

import { REFRESH_INTERVAL_MS, shouldKeepRefreshing } from './coverage-status-policy';

export interface CoverageStatusProps {
  readonly job: CoverageJobState;
}

export function CoverageStatus({ job }: CoverageStatusProps): ReactElement | null {
  const router = useRouter();
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!shouldKeepRefreshing(job.status, refreshCount)) {
      return;
    }
    const timer = setTimeout(() => {
      setRefreshCount((count) => count + 1);
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [job.status, refreshCount, router]);

  // Mejora silenciosa: si el estado ya es terminal o el techo de refrescos
  // se alcanzó, este componente no añade nada — page.tsx ya renderizó el
  // estado final en su rama server-rendered.
  if (!shouldKeepRefreshing(job.status, refreshCount)) {
    return null;
  }

  return <p aria-live="polite">Comprobando de nuevo automáticamente…</p>;
}
