// D.13 (decisión 181) — el `CoverageStatus` REAL, sin doble: solo explica el refresco y no es una
// región viva (el aviso del servidor es la única). Los tests de página lo sustituyen por un doble,
// así que esta es la única prueba que renderiza el componente de verdad. Se sustituye solo
// `useRouter`, que `renderToStaticMarkup` no puede proveer.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: (): { refresh: () => void } => ({ refresh: vi.fn() }),
}));

const { CoverageStatus } = await import('../src/components/coverage-status.js');
const { describeRefresh } = await import('../src/components/coverage-status-policy.js');

function jobWith(
  status: 'pending' | 'running' | 'done' | 'failed'
): Parameters<typeof CoverageStatus>[0]['job'] {
  return {
    status,
    attempts: 0,
    requestedAt: new Date('2026-10-08T12:00:00Z'),
    startedAt: null,
    error: null,
  };
}

describe('CoverageStatus (componente real)', () => {
  it.each(['pending', 'running'] as const)(
    'con %s muestra el texto de refresco, sin aria-live ni role',
    (status) => {
      const html = renderToStaticMarkup(<CoverageStatus job={jobWith(status)} />);
      expect(html).toContain(describeRefresh(status, 0) ?? 'texto ausente');
      expect(html).toContain('cada 5 segundos durante 2 minutos');
      expect(html).not.toContain('aria-live');
      expect(html).not.toContain('role=');
    }
  );

  it.each(['done', 'failed'] as const)('con %s no renderiza nada', (status) => {
    expect(renderToStaticMarkup(<CoverageStatus job={jobWith(status)} />)).toBe('');
  });
});
