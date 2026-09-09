# @buscahogar/db

Esquema de base de datos, cliente ORM y migraciones.

## Propósito

Este paquete contiene:

- **Esquema Drizzle** de todas las tablas: sources, listings, listing_versions, listing_features, properties, property_listings, zones, coverage_jobs, locations, features
- **Cliente de base de datos** para consultas
- **Migraciones** generadas por drizzle-kit
- **Tipos derivados** del esquema (exportados por Drizzle)

## Dependencias

- `@buscahogar/core` — para tipos e interfaces del dominio
- `drizzle-orm` — ORM tipado
- `pg` — driver PostgreSQL

## Importado por

- `apps/web` — Server Components consultando la base de datos
- `apps/ingestion` — persistencia de listings, properties, etc.

## Estructura

```
src/
  index.ts              Cliente y exports públicos
  tables.ts             Barrel: reexporta todas las tablas y enums (fuera del glob de esquema)
  types.ts              Tipos derivados ($inferSelect / $inferInsert) y SignalBreakdown
  spatial.ts             Punto único de las consultas de distancia (withinMeters)
  db.ts                  Inicialización del cliente (createDb)
  seed.ts                Seed vacío
  schema/
    enums.ts             Enums de PostgreSQL (solo coverage_job_status)
    columns.ts            Columnas y helpers compartidos (geographyPoint, id, createdAt)
    sources.ts, listings.ts, listing-versions.ts, listing-features.ts,
    properties.ts, property-listings.ts, zones.ts, coverage-jobs.ts,
    locations.ts, features.ts     Una tabla por fichero

migrations/
  0000_enable_postgis.sql   Migración --custom: crea la extensión PostGIS
  0001_*.sql                Migración generada a partir del esquema (drizzle-kit)
  ...
```

## Crecimiento esperado

El paso 1.3 de la hoja de ruta:

- Define el esquema completo: sources, listings, listing_versions, listing_features, properties, property_listings, zones, coverage_jobs, locations, features
- Genera la migración inicial (extensión PostGIS + esquema completo)
- Modela versionado de listings, desglose de señales en property_listings, índice espacial GiST
