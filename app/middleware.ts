import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Rutas que NO requieren autenticación
const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/signup",
  "/auth/callback",
  "/auth/error",
];

// Rutas de la raíz que redirigen al dashboard si el usuario ya está logueado
const ROOT_ROUTES = ["/"];

/**
 * Middleware de autenticación con @supabase/ssr.
 *
 * - Valida la sesión real en edge (getUser() → JWT verificado contra Supabase Auth).
 * - Ruta protegida + sin sesión  → redirect a /auth/login?redirectTo=<pathname>
 * - Ruta de login + con sesión   → redirect a /tasks (UX: evitar ver el login logueado)
 * - Renueva las cookies de sesión en cada request (supabase/ssr lo hace automáticamente).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Construir response inicial que pasaremos al cliente SSR de Supabase
  // para que pueda escribir cookies de refresco en el mismo response.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Escribir cookies en el request y en el response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() es la forma oficial de validar la sesión en el servidor.
  // A diferencia de getSession(), no confía en el JWT del cliente — verifica
  // el token contra el Auth server de Supabase en cada request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
  const isRootRoute = ROOT_ROUTES.includes(pathname);

  // Usuario autenticado intentando acceder al login o a la raíz → ir al dashboard
  if (user && (isPublicRoute || isRootRoute)) {
    return NextResponse.redirect(new URL("/tasks", request.url));
  }

  // Usuario sin sesión intentando acceder a una ruta protegida → login
  if (!user && !isPublicRoute && !isRootRoute) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplicar a todas las rutas excepto:
     * - _next/static  (assets estáticos)
     * - _next/image   (optimización de imágenes)
     * - favicon.ico
     * - archivos con extensión (imágenes, fonts, etc.)
     * - /api/*        (las rutas API validan con getAuthContext propio)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$|api/).*)",
  ],
};
