import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Alinea outputFileTracingRoot con turbopack.root (ambos apuntan al directorio app/)
  // para eliminar el warning "Both outputFileTracingRoot and turbopack.root are set
  // but they must have the same value" que aparece en Vercel/Turbopack.
  outputFileTracingRoot: path.resolve(__dirname),
  async headers() {
    return [
      {
        // Aplicar security headers a todas las rutas
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
