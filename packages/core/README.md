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
  index.ts           Exporta el API público
  types/             Tipos e interfaces
  schemas/           Esquemas Zod
  strategies/        Contratos (PropertySource, ListingNormalizer, etc.)
```

## Crecimiento esperado

Los pasos iniciales de la hoja de ruta poblán este paquete con:

- 1.4: tipos de Listing, Location, Feature, PropertyType, OperationType, AreaQuery, SourcePage, SimilarityResult
- 1.4: interfaces PropertySource, ListingNormalizer, DedupStrategy
- 1.4: esquemas Zod para tipos que cruzan fronteras externas
- 1.9+: implementaciones concretas de estrategias de deduplicación
