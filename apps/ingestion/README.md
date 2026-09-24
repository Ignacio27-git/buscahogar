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

## Sonda de la API de Idealista (paso 1.5)

Script de diagnóstico en `scripts/probe-idealista.ts`. No forma parte del código
que se emite a `dist/` (ver `tsconfig.build.json`): es herramienta operativa
local, no superficie publicada.

**Flujo obligatorio: primero dry-run, luego `--execute`.** Por defecto el
script no abre ninguna conexión de red: solo imprime la petición que enviaría
(URL, método, campos del formulario) y sale. Nunca imprime el valor de
`Authorization`. Repasa esa salida antes de gastar cuota real.

```bash
# 1. Rehearsal a coste cero — revisa la petición planeada antes de nada.
pnpm --filter @buscahogar/ingestion run probe:homes
pnpm --filter @buscahogar/ingestion run probe:premises

# 2. Solo tras revisar el paso anterior, la llamada real (gasta cuota):
pnpm --filter @buscahogar/ingestion run probe:homes -- --execute
```

**Ojo con el reenvío de argumentos.** `pnpm run <script> -- --execute` reenvía
el `--` como argumento literal, y `parseArgs` lo rechaza en modo estricto. Y
`pnpm exec` no se sitúa en el directorio del paquete, asi que `../../.env` no
resuelve desde la raiz del repositorio. La forma fiable es invocar desde el
propio paquete:

```bash
cd apps/ingestion
node --env-file=../../.env --import tsx scripts/probe-idealista.ts --profile homes --execute
```

Ambos fallos son seguros: el script aborta antes de abrir ninguna conexion, sin
gastar cuota.

**Presupuesto de esta sonda: dos llamadas de búsqueda facturables en total**
(una por `--profile`, `homes` y `premises`), nunca más — el script no
reintenta y el contador de peticiones (`scripts/probe/ledger.ts`) lanza una
excepción antes de permitir una segunda llamada del mismo tipo en el mismo
proceso.

**Credenciales.** El script lee `IDEALISTA_API_KEY` e `IDEALISTA_API_SECRET`
del entorno (`.env` en la raíz del monorepo, vía `--env-file`). Ambas deben
estar presentes en `.env.example` con esos nombres exactos — se añaden a mano,
nunca desde este script. Sin ellas, `--execute` falla antes de abrir ninguna
conexión de red.

**Análisis offline.** `probe:analyse` relee fixtures ya commiteadas —no hace
peticiones y no necesita credenciales—:

```bash
pnpm --filter @buscahogar/ingestion run probe:analyse -- test/fixtures/idealista/search-homes-*.json test/fixtures/idealista/search-premises-*.json
```
