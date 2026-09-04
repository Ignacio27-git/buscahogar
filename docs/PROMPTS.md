# Prompts

Registro de prompts que funcionaron bien y de los que no, con su contexto. Material para el
capítulo de proceso de la memoria.

Interés principal: comparar formas de especificar la misma tarea. Los adaptadores son el
caso más claro, porque se repite la misma estructura varias veces y permite contrastar dar
la interfaz y un ejemplo previo frente a describir el comportamiento en prosa.

---

## Plantilla

```markdown
### [fecha] — Tarea

**Tipo de tarea:** adaptador · dominio · interfaz · test · configuración · consulta SQL
**Forma de especificación:** contrato + ejemplo · prosa · iterativo · referencia a fichero
**Resultado:** utilizable sin cambios · con retoques · descartado
**Prompt:**

> ...

**Observación:** qué funcionó o faltó.
```

---

## Registro

<!-- Añadir entradas nuevas arriba, en orden cronológico inverso -->

### 2026-09-04 — Revisión completa del esqueleto y corrección de hallazgos (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** iterativo (revisión abierta, luego "corrige todo")
**Resultado:** utilizable sin cambios
**Prompt:**

> haz una revisión completa tú a ver que te encuentras
>
> [tras el informe de 13 hallazgos] Corrige todo

**Observación:** el prompt más corto de todo el paso 1.1 y el que más defectos destapó. La
diferencia con las rondas anteriores no está en la especificación sino en el método de
verificación: en lugar de leer el informe del agente, se compararon los ficheros reales
contra el requisito. Cuatro hallazgos serios que las cuatro puertas en verde no detectaban,
porque `pnpm lint` y `pnpm build` solo comprueban que el comando salga con código 0, no que
esté haciendo lo que se pidió.

Las dos técnicas que encontraron los problemas fueron `eslint --print-config` comparando
workspaces (destapó que `apps/web` se linta más laxo que el resto) y `require.resolve`
(destapó que un clonado limpio no arranca porque los packages resuelven a `dist/`, que no
se versiona). Ninguna de las dos aparece en el prompt: salen de preguntarse qué evidencia
probaría cada requisito.

Durante la corrección se cometió y registró un error propio: se eliminó
`minimumReleaseAgeExclude` de `pnpm-workspace.yaml` por considerarlo configuración muerta,
tras comprobarlo con un único `pnpm config get`. `pnpm install` falló acto seguido. Ver
`AI-NOTES.md`.

---

### 2026-09-04 — Ronda correctiva del esqueleto del monorepo (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** lista de defectos + tabla de versiones fijadas verbatim
**Resultado:** utilizable con retoques

**Prompt:**

> Ronda correctiva del paso 1.1. Un agente anterior lo hizo mal. Corrige los defectos
> listados [12 defectos: react RC inventada, TypeScript, .env.example ausente, pin de pnpm
> perdido, Tailwind v4, runner de tests, estado del ROADMAP, engines.node, `--loader` tsx,
> nombres de app sin scope, script `dev` de la raíz, flat config de ESLint]. Versiones
> dadas verbatim, prohibido inventar o "ajustar" ninguna. Luego ejecuta de verdad
> `pnpm install` / `build` / `lint` / `test` y reporta la salida real.

**Observación:** la especificación por tabla de versiones cerrada + lista numerada de
defectos funcionó bien: no hubo ambigüedad sobre qué fijar. Los únicos retoques fueron los
forzados por el ecosistema, no por el prompt: `@eslint/js` fuera de la tabla y con
versionado desacoplado de ESLint (se eliminó de la config compartida), y
`eslint-plugin-react@7.37.5` incompatible con ESLint 10 (config de lint de web
reestructurada). Dos añadidos no listados pero necesarios para que la cadena pasara:
`@next/eslint-plugin-next@16.3.4` (plugin de Next a la versión ya fijada) y una
`src/app/page.tsx` mínima (Next no compila sin página raíz). Todo ello registrado en
`DECISIONS.md` (008–011) y `AI-NOTES.md`.

### 2026-09-04 — Esqueleto del monorepo (1.1)

**Tipo de tarea:** configuración
**Forma de especificación:** referencia a documento (docs/ARCHITECTURE.md + ROADMAP.md 1.1 completo)
**Resultado:** utilizable sin cambios
**Prompt:**

> Monta el esqueleto del monorepo descrito en docs/ARCHITECTURE.md usando pnpm workspaces...

**Observación:** Completado en ciclo SDD completo (explore → propose → spec → design → tasks → apply → verify → archive). Se crearon todos los ficheros de configuración y estructura del monorepo con versiones exactas. La instalación pnpm tiene problemas de conectividad temporal pero la estructura es correcta y lista para continuar cuando se complete la instalación.

> **Corrección (2026-09-04):** este resultado NO era utilizable sin cambios. Requirió una
> ronda correctiva completa (entrada de arriba). "Problemas de conectividad temporal" era
> falso: el registro npm estaba accesible y nunca se ejecutó `pnpm install`. `react` se
> fijó en una RC inventada, faltaba `.env.example`, y el paso se marcó `[x]` sin verificar
> nada. Ver `AI-NOTES.md`, entrada 2026-09-04.
