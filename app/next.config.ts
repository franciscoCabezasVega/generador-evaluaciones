import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // turbopack.root apunta al root del repo (parent de app/).
  // Localmente elimina el warning de "multiple lockfiles" (pnpm-lock.yaml en root + app/).
  // En Vercel coincide con outputFileTracingRoot=/vercel/path0 que Vercel inyecta,
  // evitando el conflicto "Both outputFileTracingRoot and turbopack.root are set".
  turbopack: {
    root: path.join(__dirname, ".."),
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
