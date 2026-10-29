// D.14 (decisión 192) — mensajes compartidos de los esquemas de parámetros de búsqueda. Interno
// del paquete: no se exporta por el barril.
//
// Todos son fragmentos en minúscula, sin la clave del parámetro y sin formas impersonales: la
// página antepone el rótulo en español («Precio mínimo (€): …») con `formatSearchIssue`, así que
// el mensaje se lee como el valor de una etiqueta. Ningún texto por defecto de Zod debe llegar a
// la persona, por eso cada comprobación de los esquemas lleva el suyo.

// Next.js resuelve una clave repetida como array: el esquema de cadena rechaza el tipo.
export const REPEATED_VALUE = 'aparece repetido en el enlace; deja un solo valor.';

// Enumerados cerrados: valor fuera de la lista (o repetido).
export const CHOOSE_OPTION = 'elige una de las opciones de la lista.';
