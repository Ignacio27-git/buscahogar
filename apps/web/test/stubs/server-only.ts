// ROADMAP 1.15 (security-hardening, diseño decisión 081) — doble VACÍO del
// paquete real `server-only` para el pipeline de vitest. El paquete real
// LANZA cuando se importa fuera de un entorno de servidor de Next.js (su
// mecanismo de guard); en vitest (`environment: 'node'`, sin el runtime de
// Next detrás) ese lanzamiento sería un falso positivo — este stub no hace
// nada, solo permite que `import 'server-only'` resuelva sin efecto.
// Aliaseado en `vitest.config.ts`.
export {};
