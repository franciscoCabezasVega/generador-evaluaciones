import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware simplificado - La autenticación se maneja en el cliente con AuthContext
 * No hacemos verificaciones de sesión aquí porque:
 * 1. Las cookies de Supabase tienen prefijos dinámicos
 * 2. El AuthContext ya maneja redirects a login
 * 3. Evitamos loops infinitos de peticiones
 */
export function middleware(_request: NextRequest) {
  // El middleware solo pasa las peticiones a través
  // La validación de autenticación ocurre en el cliente (AuthContext)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
