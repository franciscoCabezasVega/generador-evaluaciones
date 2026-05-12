import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getRoleNameById } from "@/lib/cache/rolesCache";
import { User } from "@supabase/supabase-js";

// Singleton service-role client (reused across requests in the same process)
let _serviceClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  if (_serviceClient) return _serviceClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase configuration");
    return null;
  }
  _serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  return _serviceClient;
}

// ─── Auth context in-process cache (TTL 30s) ──────────────────────────────────
// Keyed by SHA-256(token). Never stores the raw token as key.
// Warm hit avoids 2 RTT (auth.getUser + user_profiles SELECT) per request.
// Lambda isolation means this cache is per-process, which is acceptable:
// even a cold start shares cache across requests in the same warm instance.

interface AuthCacheEntry {
  ctx: { user: User; role: string | null; token: string };
  expiresAt: number;
}

const _authCache = new Map<string, AuthCacheEntry>();
const _authCachePending = new Map<string, Promise<AuthCacheEntry | null>>();
const AUTH_CACHE_TTL_MS = 30_000; // 30 seconds

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extraer token del header Authorization
 */
function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring("Bearer ".length);
}

/**
 * Obtener usuario desde el JWT del request
 * El token viene en el header Authorization: Bearer <token>
 */
export async function getUserFromRequest(request: NextRequest) {
  try {
    const token = extractToken(request);
    if (!token) return null;

    const supabase = getServiceClient();
    if (!supabase) return null;

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("Token verification failed:", error);
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
}

/**
 * Obtener el rol del usuario desde user_profiles
 * Reutiliza el singleton service-role client
 */
export async function getUserRole(userId: string) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("role_id")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching user role:", error);
      return null;
    }

    return await getRoleNameById(data.role_id, supabase);
  } catch (error) {
    console.error("Error in getUserRole:", error);
    return null;
  }
}

/**
 * Contexto de autenticación completo: usuario + rol + cliente autenticado
 * Combina getUserFromRequest + getUserRole + getAuthenticatedSupabase en 1 llamada
 * Reutiliza el mismo service-role client para JWT verification y role lookup.
 * Resultado cacheado en memoria por 30s (keyed por SHA-256 del token).
 */
export async function getAuthContext(request: NextRequest): Promise<{
  user: User;
  role: string | null;
  supabase: SupabaseClient;
  token: string;
} | null> {
  try {
    const token = extractToken(request);
    if (!token) return null;

    const cacheKey = await hashToken(token);
    const now = Date.now();

    // Cache hit — return immediately without hitting Supabase
    const cached = _authCache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > now) {
        const supabase = getAuthenticatedSupabase(token);
        return { ...cached.ctx, supabase };
      }
      // Eliminar entradas expiradas de forma oportunista
      _authCache.delete(cacheKey);
    }

    // Deduplicate concurrent requests for the same token (Promise coalescing)
    if (_authCachePending.has(cacheKey)) {
      const entry = await _authCachePending.get(cacheKey)!;
      if (!entry) return null;
      const supabase = getAuthenticatedSupabase(token);
      return { ...entry.ctx, supabase };
    }

    const pendingPromise = (async (): Promise<AuthCacheEntry | null> => {
      try {
        const serviceClient = getServiceClient();
        if (!serviceClient) return null;

        const {
          data: { user },
          error,
        } = await serviceClient.auth.getUser(token);

        if (error || !user) return null;

        let role: string | null = null;
        const { data: profileData } = await serviceClient
          .from("user_profiles")
          .select("role_id")
          .eq("id", user.id)
          .single();

        if (profileData) {
          role = await getRoleNameById(profileData.role_id, serviceClient);
        }

        const entry: AuthCacheEntry = {
          ctx: { user, role, token },
          expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
        };
        _authCache.set(cacheKey, entry);
        return entry;
      } finally {
        _authCachePending.delete(cacheKey);
      }
    })();

    _authCachePending.set(cacheKey, pendingPromise);
    const entry = await pendingPromise;
    if (!entry) return null;

    const supabase = getAuthenticatedSupabase(token);
    return { ...entry.ctx, supabase };
  } catch (error) {
    console.error("Error in getAuthContext:", error);
    return null;
  }
}

/**
 * Obtener cliente autenticado de Supabase en servidor
 */
export function getAuthenticatedSupabase(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
  });
}
