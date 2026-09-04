# @buscahogar/config

Configuración compartida para TypeScript, ESLint y Prettier en el monorepo.

## Uso

### TypeScript

En el `tsconfig.json` de cada paquete, extiende la configuración base:

```json
{
  "extends": "@buscahogar/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

### ESLint

En el `eslint.config.mjs` de cada paquete (si lo necesita):

```javascript
import baseConfig from '@buscahogar/config/eslint.config.mjs';
export default [...baseConfig];
```

### Prettier

Hereda `.prettierrc.json` desde la raíz del monorepo o especifica en `prettier.config.mjs`:

```javascript
export { default } from '@buscahogar/config/.prettierrc.json';
```

## Modo estricto

Todas las configuraciones usan **strict mode**:

- TypeScript: `"strict": true` con todas las flags activas
- ESLint: reglas recomendadas + TypeScript estrictas
- Sin `any`: si hace falta, usar `unknown` y estrechar el tipo

Ninguna excepción sin documentar.
