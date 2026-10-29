// D.19 (decisión 230) — Figtree autoalojada. Fuente variable (peso 300-900) con el subconjunto latin,
// tomada de @fontsource-variable/figtree@5.3.0 (`files/figtree-latin-wght-normal.woff2`, 20.156 bytes) y
// versionada junto a su licencia (`OFL.txt`, SIL OFL 1.1). No es una dependencia del proyecto.
//
// `next/font/local` sirve el fichero desde `/_next/static/media` (mismo origen, `font-src 'self'`): ninguna
// petición a un tercero. `variable` declara `--font-figtree` en el elemento que lleve `figtree.variable`
// (`<html>` en `layout.tsx`); `--font-sans` de `globals.css` lo usa como primera familia y la pila del
// sistema como respaldo. El peso 600 es real (no sintetizado). `adjustFontFallback` genera un respaldo con
// las métricas de Arial para reducir el salto de maquetación mientras carga (`display: 'swap'`).
//
// Las páginas independientes (`error.tsx`, `global-error.tsx` y el 429 del proxy) no la usan: conservan la
// pila del sistema (decisión 233).
import localFont from 'next/font/local';

export const figtree = localFont({
  src: './figtree-latin-wght-normal.woff2',
  weight: '300 900',
  style: 'normal',
  variable: '--font-figtree',
  display: 'swap',
  adjustFontFallback: 'Arial',
});
