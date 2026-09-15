# @buscahogar/core

Modelo de dominio, tipos e interfaces del agregador inmobiliario.

## Propósito

Este paquete contiene:

- **Tipos e interfaces** del modelo de dominio (Listing, Property, Location, etc.)
- **Esquemas Zod** para validar datos que cruzan fronteras externas
- **Contratos intercambiables** (PropertySource, ListingNormalizer, DedupStrategy)
- **Lógica pura** que puede testearse sin dependencias

## Restricciones

❌ NO importa:

- Next.js o React
- ORM (Drizzle, Prisma, etc.)
- apps/web ni apps/ingestion
- Librerías específicas de ejecución

✅ SÍ importa:

- zod (validación)
- Tipos TypeScript estándar

## Estructura

```
src/
  index.ts           Superficie pública (reexports explícitos, no `export *`)
  types/             Tipos e interfaces escritos a mano
  schemas/           Esquemas Zod (Listing, AreaQuery) + tipos derivados con z.infer
  contracts/         Contratos intercambiables (PropertySource, ListingNormalizer, DedupStrategy)
```

`contracts/` sustituye a la propuesta original de `strategies/` (paso 1.4): `strategies/`
queda reservado para las implementaciones concretas de 1.9+, y `contracts/` es el contrato
del que dependen, un directorio distinto para no mezclar la interfaz con una implementación
de esa interfaz en la misma carpeta.

**Convención mixta deliberada.** `Listing` y `AreaQuery` se derivan del esquema Zod
correspondiente con `z.infer`, porque ambos cruzan una frontera externa real (salida del
normalizador; entrada de CLI y de search params) donde la deriva entre tipo y validación es
cara. El resto de tipos están escritos a mano: nunca se parsean, así que esquematizarlos
añadiría maquinaria de validación sin entrada externa que validar (decisión 023). El
razonamiento completo, con ejemplo, vive en `src/index.ts`.

## Crecimiento esperado

- **1.4 — hecho.** Tipos de dominio (`Listing`, `Location`, `Feature`, `PropertyType`,
  `OperationType`, `AreaQuery`, `SourcePage`, `SimilarityResult`), las interfaces
  `PropertySource`, `ListingNormalizer` y `DedupStrategy`, los esquemas Zod de `Listing` y
  `AreaQuery`, y la regla de frontera `no-restricted-imports` de este paquete.
- **1.8 — hecho.** `blockingThresholdsSchema` (radio, banda de precio, margen de superficie)
  y `CandidatePair` (tipo escrito a mano, sin campo de decisión) para el bloqueo de
  candidatos que consume `packages/db`.
- **1.9 — hecho.** Primera `DedupStrategy` basada en reglas sobre datos estructurados
  (`ruleBasedDedupStrategy`, `strategies/rule-based/`): distancia pura (`geo/`), señales
  de precio/superficie/habitaciones/baños, normalización de direcciones en dos niveles
  (fuerte/zona) y bandeado `accept`/`undecided`/`reject` (`classify`) con un veto de solo
  rechazo sobre `propertyType`/`operation`. Corpus de 24 pares etiquetados
  (`packages/core/test/dedup-corpus.ts`) que prueba mecánica, no calibración — pesos y
  umbrales quedan sin validar a escala hasta ROADMAP 1.10.
- 1.10+: consolidación de viviendas canónicas y comparación de estrategias.
