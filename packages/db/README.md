# @buscahogar/db

Esquema de base de datos, cliente ORM y migraciones.

## Propósito

Este paquete contiene:

- **Esquema Drizzle** de todas las tablas: sources, listings, properties, property_listings, zones, coverage_jobs, locations, features
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
  index.ts           Cliente y exports públicos
  schema.ts          Esquema Drizzle de las tablas
  db.ts              Inicialización del cliente

migrations/
  0001_initial.sql   Migración inicial (generada por drizzle-kit)
  ...
```

## Crecimiento esperado

El paso 1.3 de la hoja de ruta:

- Define el esquema completo: sources, listings, properties, property_listings, zones, coverage_jobs, locations, features
- Genera la migración inicial
- Modela versionado de listings, desglose de señales en property_listings, índice espacial GiST
