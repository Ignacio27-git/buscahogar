# Agregador inmobiliario

Plataforma que agrega ofertas inmobiliarias procedentes de varias fuentes, las normaliza a
un modelo común, identifica anuncios que corresponden a la misma vivienda y ofrece una
búsqueda unificada, redirigiendo al anuncio original.

Trabajo Fin de Máster.

## Documentación

| Documento              | Contenido                                                  |
| ---------------------- | ---------------------------------------------------------- |
| `CLAUDE.md`            | Contexto y reglas para el desarrollo asistido              |
| `docs/ARCHITECTURE.md` | Arquitectura, modelo de datos y pipeline                   |
| `docs/DECISIONS.md`    | Decisiones de arquitectura y su justificación              |
| `docs/ROADMAP.md`      | Pasos de desarrollo, con el prompt de cada uno y su estado |
| `docs/AI-NOTES.md`     | Registro de fallos de la asistencia                        |
| `docs/PROMPTS.md`      | Registro de prompts                                        |

## Requisitos

- Node.js
- Docker y Docker Compose
- Credenciales de la API de la fuente (ver `.env.example`)

## Puesta en marcha

```bash
cp .env.example .env    # completar credenciales
docker compose up -d    # postgres + postgis
pnpm install
pnpm db:migrate
pnpm dev
```

## Base de datos

Solo la base de datos se levanta con Docker. `web` e `ingestion` se ejecutan en local con
`pnpm dev:web` y `pnpm dev:ingestion`.

```bash
docker compose up -d      # levantar en segundo plano
docker compose stop       # parar, conservando los datos
docker compose down       # parar y eliminar el contenedor, conservando los datos
```

Para comprobar que PostGIS está realmente habilitado en la base de datos de la aplicación,
y no solo instalado en la imagen:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Version();"'
```

Debe devolver una cadena de versión. Si responde `function postgis_version() does not exist`,
la extensión no llegó a crearse: el volumen ya tenía datos la primera vez que arrancó el
contenedor, y el script de inicialización de la imagen solo se ejecuta sobre un volumen
vacío. La solución es resetear.

**Resetear borra todos los datos de forma irreversible.** No hay copia de seguridad ni
confirmación: `-v` elimina el volumen con el contenido de la base de datos.

```bash
docker compose down -v    # BORRA el volumen y todos los datos
docker compose up -d      # recrea la base de datos vacía, con PostGIS habilitado
```

`-v` afecta a todos los volúmenes declarados en `docker-compose.yml`, no solo al de la base
de datos. Hoy solo hay uno, pero si más adelante se añade otro, este comando también lo
borrará.

Alternativa quirúrgica, con el contenedor ya parado:

```bash
docker volume rm buscahogar_postgres_data
```

## Estructura

```text
apps/web          Next.js — interfaz y búsqueda
apps/ingestion    worker — barridos, normalización, deduplicación
packages/core     modelo de dominio y contratos
packages/db       esquema y cliente de base de datos
```

## Aviso sobre la cuota

La API de la fuente tiene un límite mensual de peticiones. Los barridos consumen cuota real.
No ejecutar ingestas de prueba sin acotar la zona, y no llamar nunca a la API desde tests:
usar los fixtures grabados.
