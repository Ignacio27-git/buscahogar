import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imágenes remotas: los dominios de las fuentes se añadirán aquí (paso 1.11).
  // Las credenciales de las fuentes NUNCA llegan a este workspace: viven solo
  // en apps/ingestion y jamás en variables NEXT_PUBLIC_*.
  images: {
    remotePatterns: [
      // Ej: { protocol: 'https', hostname: '*.idealista.com' },
    ],
  },
};

export default nextConfig;
