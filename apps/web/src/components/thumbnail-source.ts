// ROADMAP 1.11 — decisión pura miniatura-vs-placeholder (diseño D5;
// arbitraje obs #175, escenario (iii)). Extraída como función pura para que
// el escenario del spec "sin miniatura es un estado normal" sea
// falsificable en node plano, sin renderizar ningún componente —
// `apps/web/vitest.config.ts` sigue sin jsdom (arbitraje, RULING).
export type ThumbnailSource = { readonly kind: 'thumbnail'; readonly url: string } | { readonly kind: 'placeholder' };

export function resolveThumbnailSource(thumbnailUrl: string | null | undefined): ThumbnailSource {
  if (thumbnailUrl === null || thumbnailUrl === undefined) {
    return { kind: 'placeholder' };
  }
  return { kind: 'thumbnail', url: thumbnailUrl };
}
