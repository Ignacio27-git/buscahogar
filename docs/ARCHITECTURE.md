# Arquitectura

## Estructura

```text
apps/
  web/            Next.js (App Router) — interfaz y consultas de búsqueda
  ingestion/      worker Node — scheduler, adaptadores, pipeline, coverage jobs
packages/
  core/           modelo común, contratos, estrategias de deduplicación
  db/             esquema y cliente de base de datos
  config/         configuración compartida de TypeScript y linting
```

`web` e `ingestion` dependen de `core` y `db`. No se conocen entre sí; su única vía de
comunicación es la base de datos.

`core` no importa Next ni el ORM. Contiene el modelo de dominio y la lógica pura, lo que
permite testearla de forma aislada.

## Pipeline de ingesta

```text
API de la fuente
      ↓
Adaptador           respuesta cruda → RawListing
      ↓
Normalizador        RawListing → Listing
      ↓
tablas listings +   identidad del anuncio (listings) + instantáneas de precio y
listing_versions    contenido (listing_versions), una por versión
      ↓
Deduplicación       bloqueo + puntuación
      ↓
tabla properties    vivienda canónica
      ↓
Next.js — búsqueda
```

Los tres primeros pasos se ejecutan por fuente. Los dos últimos son globales y pueden
lanzarse por separado sobre datos ya persistidos, sin gastar cuota.

## Contratos

```typescript
interface PropertySource<T = unknown> {
  readonly id: string;
  fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage<T>>;
}

interface ListingNormalizer<T> {
  normalize(raw: T): Listing;
}

interface DedupStrategy {
  readonly name: string;
  readonly version: string;
  score(a: Listing, b: Listing): SimilarityResult;
}
```

`SourcePage<T = unknown>` incluye `nextCursor`, el cursor siguiente, para poder reanudar un
barrido interrumpido sin repetir peticiones. `T` es siempre el payload crudo de la fuente,
antes de normalizar — nunca un `Listing`.

`DedupStrategy.version` acompaña a `name` porque `property_listings.strategy_version` es
`NOT NULL` y no existe otra fuente de dominio para ese valor (decisión 020).

`SimilarityResult` incluye la puntuación total **y el desglose por señal**.

## Modelo de datos

- **`listings`** — identidad estable de un anuncio: un registro por anuncio y fuente,
  nunca sobrescrito.
- **`listing_versions`** — histórico de instantáneas de un anuncio, en orden de aparición:
  cada cambio de precio o contenido añade una versión nueva en lugar de modificar la
  existente. La versión vigente se marca con `is_current`.
- **`listing_features`** — amenities de una versión concreta de un anuncio (relación con
  `features`); cuelga de la versión, no de la identidad, porque una versión es una
  instantánea completa.
- **`properties`** — vivienda canónica; agrupación de uno o varios listings.
- **`property_listings`** — relación, con puntuación, desglose por señal y estrategia que
  produjo la decisión.
- **`sources`** — fuentes registradas.
- **`zones`** — zonas cubiertas: identificador canónico, estado, fecha del último barrido.
- **`coverage_jobs`** — cola de barridos pendientes (`pending`, `running`, `done`, `failed`).
- **`locations`**, **`features`** — datos normalizados auxiliares.

## Cobertura bajo demanda

El ámbito es España, pero el índice crece según la demanda. La unidad de cobertura es el
**municipio**.

```text
Consulta del usuario
        ↓
Resolución a identificador canónico de zona
        ↓
   ¿zona cubierta?
        │
   sí ──┴── no
   │          │
resultados   se registra un coverage_job
inmediatos    ↓
             el worker barre, normaliza y deduplica la zona
              ↓
             la zona queda cubierta y entra en los ciclos de refresco
```

**Identidad de zona.** Distintas formulaciones de la misma ubicación deben resolver al
mismo identificador canónico, o se ingiere lo mismo varias veces y se gasta cuota. La
interfaz ofrece autocompletado sobre zonas canónicas en lugar de texto libre.

**Cola.** `coverage_jobs` en la propia base de datos. No se introduce Redis ni un sistema
de colas externo.

**Cuota.** Presupuesto diario de peticiones y tope de zonas nuevas por día y por sesión.
Degradación explícita al alcanzarlo.

## Atribución de datos geográficos

El catálogo de municipios (centroide y radio de barrido por municipio, ROADMAP 1.13) se deriva
del Nomenclátor Geográfico de Municipios y Entidades de Población (NGMEP), publicado por el
Instituto Geográfico Nacional (IGN) a través del Centro Nacional de Información Geográfica
(CNIG), bajo licencia **CC-BY 4.0**, según lo exige la Orden FOM/2807/2015. La atribución es
visible al usuario en el pie de página de `apps/web` (`layout.tsx`, Server Component, sin coste
de JavaScript) y queda registrada, con su procedencia exacta (URLs de origen, fecha de descarga,
checksum, sistema de referencia verbatim del fichero), en la cabecera del propio artefacto de
catálogo committeado (`packages/db/src/municipality-catalogue.generated.ts`).

## Refresco y retención

Implementado en el paso 2.5 (decisiones 102-111). La política es pura (`packages/core/src/retention`),
la aplican `packages/db` y el tick del worker de `apps/ingestion`, y todo el tiempo se mide con el
reloj de Postgres (días UTC).

**Demanda y cadencia.** Cada búsqueda que resuelve a una zona registra una señal
`(zona, día)` en `zone_query_signals` (`web_coverage`, solo `INSERT`). Con `d` = días desde la
última señal (o desde `coverage_jobs.requested_at` si no hay):

| `d` (días) | Cadencia |
|---|---|
| ≤ 30 | semanal (vence a los 7 días del último barrido) |
| 31 – 90 | mensual (30 días) |
| 91 – 179 | en espera, nunca vence; una consulta nueva la devuelve a semanal |
| ≥ 180 | purga de zona |

**Refresco.** El mantenimiento del tick (primer tick y luego cada `MAINTENANCE_EVERY_TICKS`) re-encola
los jobs vencidos en un carril propio, tras los jobs a demanda. El gasto de refresco y de
verificación tiene un techo sobre el gasto total del día (`REFRESH_BUDGET_FRACTION` × tope diario);
con fracción 0 no hay refresco.

**Anuncio que desaparece.** Un barrido completo solo nomina: los anuncios activos de la zona no vistos
en el ciclo entran en una cola. Se confirman con una petición por lote (`adIds`, hasta 50) sobre el
carril de refresco, y solo se retiran (`inactive` / `delisted`) si la sonda ha demostrado que la API
omite los anuncios dados de baja (`DELISTED_OMISSION_CONFIRMED`); cualquier respuesta dudosa deja el
anuncio activo. **Estado actual: la sonda está pendiente de ejecutar por el responsable, así que no
se retira ningún anuncio.** Un anuncio inactivo sale de la búsqueda (`active_listing_count > 0`), se
conserva y se reactiva si la fuente vuelve a publicarlo.

**Purga en dos planos.**

- *Zonas*, a los 180 días sin consultas: la zona vuelve a `uncovered` (la fila de `zones` es el
  catálogo INE y no se borra), se borran su job y sus señales, y los anuncios que solo cubría su
  círculo pasan a `inactive` / `zone_purged`. No gasta cuota.
- *Anuncios*, a los 180 días inactivos: tombstone. Se redactan la descripción y el `raw` de todas sus
  versiones y la miniatura, y pasan a `removed`. Se conservan el historial de precios y la
  evidencia de deduplicación (`dedup_pair_evidence`). `property_listings` se recalcula en cada
  reproceso de dedup, así que su puntuación y desglose reflejan la consolidación vigente. Es irreversible salvo que
  la fuente vuelva a publicar el anuncio.

Cada paso del tick está aislado: una avería de uno no detiene los demás ni el barrido.

**Plazo de la fuente.** Si las condiciones de uso de una fuente fijan un plazo máximo de retención,
ese plazo prevalece. Hoy ninguna lo fija en lo que se ha podido comprobar (decisión 111); los 180
días son una elección del proyecto y viven como constantes en `policy.ts`.

## Capa web

- Server Components consultando `db` directamente para listado y detalle.
- Filtros en search params, no en estado de cliente.
- No se usan TanStack Query ni Zustand en la ruta principal.
- Imágenes remotas servidas mediante la optimización de imágenes de Next; no se almacenan.

## Infraestructura

Docker Compose con tres servicios: PostgreSQL con PostGIS, `web`, `ingestion`.

Fuera del alcance: colas externas, Redis, caché distribuida, autenticación.

## Rendimiento

- Índices para los filtros frecuentes.
- Índice espacial GiST para el bloqueo geográfico.
- Objetivo de búsqueda sobre datos indexados: por debajo de 500 ms.
- Búsqueda con cobertura bajo demanda: sin umbral cerrado; se reporta el tiempo desglosado
  por fase.

## Seguridad

- Validación con Zod de toda entrada externa: search params, variables de entorno de `apps/web`
  (`env.ts`, un lector Zod por cada grupo de variables, parseado en tiempo de llamada) y argumentos/filas CSV del conversor
  del catálogo municipal (`apps/ingestion`).
- Credenciales de fuentes solo en `ingestion`, nunca en variables públicas. `apps/web` usa dos
  credenciales de PostgreSQL de alcance mínimo, ninguna de propietario: lectura y una escritura
  restringida al rol `web_coverage` (pasos 1.13 y 1.15, `CLAUDE.md`).
- Consultas parametrizadas vía ORM.
- Rate limiting en endpoints públicos: cuota diaria por cliente en PostgreSQL para el registro de
  cobertura bajo demanda (clave HMAC-SHA256, nunca la IP cruda) más un limitador de ventana fija
  en memoria en `apps/web/src/proxy.ts` para el resto de peticiones — **deshabilitado por
  defecto**, activo solo cuando `CLIENT_IP_HEADER` está configurado detrás de un proxy inverso de
  confianza que sobrescriba ese header. Presupuesto de cuota frente a fuentes externas sin
  cambios (`apps/ingestion`).
- Cabeceras de seguridad y política de contenido: CSP estática sin nonces + conjunto OWASP
  (HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`/
  `X-Frame-Options: DENY`, COOP, CORP, sin COEP) vía `headers()` en `next.config.ts`; sin
  `X-Powered-By`.
- Módulos de `apps/web/src/server` con handles de base de datos o secretos guardados con
  `import 'server-only'`, para que un import accidental desde código de cliente falle en build.
- Secretos en variables de entorno, fuera del control de versiones.
