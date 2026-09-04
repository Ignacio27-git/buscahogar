# @buscahogar/web

Aplicación web del agregador inmobiliario: interfaz, búsqueda, detalle y cobertura bajo demanda.

## Arquitectura

- **Next.js 16.3.4 con App Router**
- **Server Components** consultando la base de datos directamente (sin fetching en cliente)
- **Filtros en search params** (URL), no en estado de cliente
- **Sin TanStack Query ni Zustand** en la ruta principal

## Dependencias

- `@buscahogar/core` — tipos e interfaces
- `@buscahogar/db` — cliente de base de datos
- `next` — framework
- `react` — UI

## Importante

❌ NO:

- Importar desde `apps/ingestion`
- Llamar a APIs externas (Idealista, etc.)
- Almacenar credenciales o variables NEXT_PUBLIC_*
- Usar Pages Router

✅ SÍ:

- Server Components por defecto
- Lógica en URL (search params)
- Consultas a `@buscahogar/db` desde Server Components

## Crecimiento esperado

- 1.11: búsqueda y listado
- 1.12: detalle y redirección a fuentes
- 1.13: cobertura bajo demanda
- 2.6: vista de mapa
- 3.1: búsqueda en lenguaje natural
