// Punto geográfico con campos con nombre explícito. Nunca una tupla:
// docs/DECISIONS.md, decisión 019 — si se invierten los componentes de una
// tupla `[number, number]`, los puntos de España aparecen en el océano
// Índico sin que el compilador lo detecte.
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}
