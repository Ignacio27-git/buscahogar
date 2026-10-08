// D.13 (decisión 181) — hora de Madrid para los avisos de cobertura.
//
// Vive en `apps/web` y no en `packages/core` porque es presentación (cadenas
// de idioma y zona horaria), como `format-date.ts`. El «día» del tope de zonas
// nuevas lo define SQL con el reloj de Postgres (`utcDayStart`, DD-11): aquí
// solo se MUESTRA cuándo vuelve a abrirse, con la misma medianoche UTC.
//
// Los formateadores se construyen una vez, con zona explícita: el resultado no
// depende de la zona horaria del proceso ni del visitante.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

const TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

const DAY_MS = 86_400_000;

// Primera medianoche UTC ESTRICTAMENTE posterior a `now`: a las 00:00:00.000Z
// exactas el tope ya es el del día nuevo, así que devuelve la del día siguiente.
export function nextUtcMidnight(now: Date): Date {
  return new Date((Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS);
}

// «8 oct 2026, 14:05»
export function formatMadridDateTime(date: Date): string {
  return DATE_TIME_FORMAT.format(date);
}

// «2:00» (CEST) o «1:00» (CET), sin cero a la izquierda.
export function formatMadridTime(date: Date): string {
  return TIME_FORMAT.format(date);
}
