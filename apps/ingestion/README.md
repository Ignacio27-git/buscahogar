# @buscahogar/ingestion

Worker separado para barrido de fuentes, normalización y deduplicación.

## Arquitectura

- **Node.js worker independiente** con CLI
- **Acceso a APIs externas y credenciales** — éstas viven solo aquí
- **Persistencia** en @buscahogar/db
- **Lógica de dominio** importada de @buscahogar/core

## Dependencias

- `@buscahogar/core` — tipos e interfaces
- `@buscahogar/db` — cliente de base de datos
- `zod` — validación

## Importante

❌ NO:

- Importar desde `apps/web`
- Exponer credenciales en logs sin sanitizar
- Gastar cuota innecesariamente (sin tope en bucles)
- Llamar sin paginación con cursor

✅ SÍ:

- Credenciales desde `.env` (solo aquí)
- Bucles con corte explícito
- Idempotencia (ejecutar dos veces no duplica)
- Logging detallado de cuota consumida

## Responsabilidades por paso de la hoja de ruta

- 1.5: Sonda de API (una petición, guardar fixture)
- 1.6: Adaptador PropertySource + normalizador
- 1.7: Persistencia y barrido de zona (idempotente)
- 1.8: Bloqueo de candidatos (SQL + umbrales configurables)
- 1.9: Estrategia de puntuación (DedupStrategy)
- 1.10: Consolidación de properties
- 1.13: Cobertura bajo demanda (worker que procesa coverage_jobs)
- 2.5: Refresco y retención

## CLI esperada

```bash
pnpm ingestion scan-area <zone-id> --max-requests 10
pnpm ingestion deduplicate <strategy> --threshold-distance 100
pnpm ingestion refresh-zones
```
