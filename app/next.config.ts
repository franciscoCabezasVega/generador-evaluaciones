import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // turbopack.root apunta a app/ (este mismo directorio).
  // Silencia el warning local "multiple lockfiles" porque explicita cuál es el
  // workspace root en lugar de que Next.js lo infiera. En Vercel, Vercel inyecta
  // outputFileTracingRoot=/vercel/path0 y emite un warning cosmético de conflicto,
  // pero el build finaliza correctamente usando outputFileTracingRoot.
  turbopack: {
    root: __dirname,
  },
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
