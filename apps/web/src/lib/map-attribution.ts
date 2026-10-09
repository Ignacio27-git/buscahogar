// D.15 (F7, decisión 199) — el prefijo por defecto de la atribución de Leaflet es un enlace con
// `title="A JavaScript library for interactive maps"`, en inglés, dentro de una página en español
// (WCAG 3.1.2). Se conserva el crédito, el enlace y la bandera: solo se quita el atributo `title`.
// Es una función pura para poder probarla sin Leaflet ni navegador.
const TITLE_ATTRIBUTE = /\s+title="[^"]*"/gu;

export function stripPrefixTitles(prefix: string): string {
  return prefix.replace(TITLE_ATTRIBUTE, '');
}
