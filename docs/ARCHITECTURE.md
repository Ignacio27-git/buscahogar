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
tabla listings      un registro por anuncio y versión
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
interface PropertySource {
  readonly id: string;
  fetchArea(area: AreaQuery, cursor?: string): Promise<SourcePage>;
}

interface ListingNormalizer<T> {
  normalize(raw: T): Listing;
}

interface DedupStrategy {
  readonly name: string;
  score(a: Listing, b: Listing): SimilarityResult;
}
```

`SourcePage` incluye el cursor siguiente para poder reanudar un barrido interrumpido sin
repetir peticiones.

`SimilarityResult` incluye la puntuación total **y el desglose por señal**.

## Modelo de datos

- **`listings`** — un registro por anuncio y fuente, normalizado. En la práctica inmutable:
  un cambio de precio genera una versión nueva.
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

## Refresco y retención

- Zonas con consultas recientes: refresco semanal.
- Zonas sin actividad: frecuencia menor o en espera hasta nueva solicitud.
- Anuncio que desaparece de la fuente: se marca inactivo, sale de la búsqueda, se conserva
  internamente (alimenta el histórico y el conjunto de evaluación).
- Purga en dos planos: los inactivos se retienen un periodo acotado; las zonas sin consultas
  dejan de refrescarse mucho antes de purgarse.
- Si las condiciones de uso de una fuente fijan un plazo máximo de retención, ese plazo
  prevalece.

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

- Validación con Zod de toda entrada externa, search params incluidos.
- Credenciales de fuentes solo en `ingestion`, nunca en variables públicas.
- Consultas parametrizadas vía ORM.
- Rate limiting en endpoints públicos y presupuesto de cuota frente a fuentes externas.
- Cabeceras de seguridad y política de contenido.
- Secretos en variables de entorno, fuera del control de versiones.
