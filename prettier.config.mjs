// Configuración Prettier del monorepo: reexporta la config compartida de
// packages/config para que se aplique en todos los workspaces.
import config from '@buscahogar/config/.prettierrc.json' with { type: 'json' };

export default config;
