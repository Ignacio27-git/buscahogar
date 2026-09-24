// Jerarquía administrativa canónica por municipio. Forma heredada tal cual
// de docs/DECISIONS.md, decisión 025 — no se re-deriva aquí. `ineCode` es la
// clave natural (código INE de municipio).
export interface Location {
  readonly ineCode: string;
  readonly municipality: string;
  readonly province: string;
  readonly provinceCode: string;
  readonly autonomousCommunity: string;
}
