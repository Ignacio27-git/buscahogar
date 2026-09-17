import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imágenes remotas: los dominios de las fuentes se añadirán aquí (paso 1.11).
  // Las credenciales de las fuentes NUNCA llegan a este workspace: viven solo
  // en apps/ingestion y jamás en variables NEXT_PUBLIC_*.
  images: {
    // ROADMAP 1.11 (diseño D8) — un único dominio, el observado en las 100
    // fixtures reales de ingesta (paso 1.5/1.6). El hostname es la frontera
    // de seguridad real (decide a qué servidor proxeamos); el `pathname`
    // observado (`/blur/…`) no se fija, porque pinnar una forma de ruta no
    // observada por contrato sería la misma clase de suposición que un
    // hostname con comodín, en sentido contrario.
    remotePatterns: [{ protocol: 'https', hostname: 'img4.idealista.com' }],
  },
};

export default nextConfig;
