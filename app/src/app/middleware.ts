import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware para proteger rutas que requieren autenticación
 *
 * Rutas protegidas:
 * - /tasks
 * - /reports
 * - /audit-trail
 *
 * Rutas públicas:
 * - /auth/login
 * - /auth/signup
 * - /
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rutas protegidas que requieren autenticación
  const protectedRoutes = ["/tasks", "/reports", "/audit-trail"];

  // Verificar si es una ruta protegida
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  if (!isProtectedRoute) {
    // Ruta pública, permitir acceso
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  // Para rutas protegidas, verificar si hay token válido en cookies
  const token = request.cookies.get("sb-access-token")?.value;

  if (!token) {
    console.warn(`Unauthorized access attempt to ${pathname}, no token found`);

    // Redirigir a login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Token presente, permitir acceso
  // La validación completa se hace en el cliente con Supabase Auth
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes tienen su propia validación)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
