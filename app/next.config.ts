import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // turbopack.root solo se activa fuera de Vercel.
  // - Localmente: apunta a la raíz del monorepo (../) para que Turbopack
  //   encuentre next/package.json aunque pnpm lo hoisteé ahí.
  // - En Vercel: se omite para que no conflictúe con outputFileTracingRoot
  //   que Vercel inyecta automáticamente.
  ...(process.env.VERCEL
    ? {}
    : { turbopack: { root: path.join(__dirname, "..") } }),
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
