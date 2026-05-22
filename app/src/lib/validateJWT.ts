import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

/**
 * Obtener el secret key de Supabase para validar JWT
 * Debe estar disponible en variables de entorno
 */
function getJWTSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET;

  if (!secret) {
    console.warn("SUPABASE_JWT_SECRET no configurado en el entorno");
    throw new Error("Secreto JWT no configurado");
  }

  // Convertir string a Uint8Array
  return new TextEncoder().encode(secret);
}

/**
 * Interfaz para datos decodificados del JWT
 */
export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  aud?: string;
  exp?: number; // Timestamp de expiración
  iat?: number; // Timestamp de emisión
  [key: string]: unknown;
}

/**
 * Validar el JWT del header Authorization
 *
 * @param request - NextRequest object
 * @returns JWTPayload si es válido, null si no
 *
 * Uso en API route:
 * ```
 * export async function GET(request: NextRequest) {
 *   const payload = await validateJWT(request);
 *   if (!payload) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   // Usar payload.sub como user ID
 * }
 * ```
 */
export async function validateJWT(
  request: NextRequest,
): Promise<JWTPayload | null> {
  try {
    // Obtener token del header Authorization
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("Header Authorization ausente o inválido");
      return null;
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    if (!token) {
      console.warn("Token vacío");
      return null;
    }

    // Validar JWT
    const secret = getJWTSecret();
    const { payload } = await jwtVerify(token, secret);

    // Verificar que el token no está expirado
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        console.warn("JWT token expired");
        return null;
      }
    }

    return payload as JWTPayload;
  } catch (error) {
    console.error("JWT validation error:", error);
    return null;
  }
}

/**
 * Middleware helper para proteger API routes
 *
 * Uso:
 * ```
 * export async function GET(request: NextRequest) {
 *   const response = await requireAuth(request);
 *   if (response) return response; // Unauthorized
 *   // Tu lógica aquí
 * }
 * ```
 */
export async function requireAuth(
  request: NextRequest,
): Promise<NextResponse | null> {
  const payload = await validateJWT(request);

  if (!payload) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or expired token" },
      { status: 401 },
    );
  }

  return null;
}

/**
 * Extraer user ID del JWT
 */
export async function getUserIdFromToken(
  request: NextRequest,
): Promise<string | null> {
  const payload = await validateJWT(request);
  return payload?.sub || null;
}

/**
 * Validar que el JWT sea del usuario esperado
 */
export async function validateUserToken(
  request: NextRequest,
  expectedUserId: string,
): Promise<boolean> {
  const payload = await validateJWT(request);
  return payload?.sub === expectedUserId;
}
