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
