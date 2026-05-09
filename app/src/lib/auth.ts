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
 * Reutiliza el mismo service-role client para JWT verification y role lookup
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

    const serviceClient = getServiceClient();
    if (!serviceClient) return null;

    // Verificar JWT y obtener rol en paralelo no es posible porque
    // necesitamos el user.id para el rol. Pero reutilizamos el mismo cliente.
    const {
      data: { user },
      error,
    } = await serviceClient.auth.getUser(token);

    if (error || !user) return null;

    // Obtener rol usando el mismo service client (sin crear otro)
    let role: string | null = null;
    const { data: profileData } = await serviceClient
      .from("user_profiles")
      .select("role_id")
      .eq("id", user.id)
      .single();

    if (profileData) {
      role = await getRoleNameById(profileData.role_id, serviceClient);
    }

    // Crear cliente autenticado con RLS
    const supabase = getAuthenticatedSupabase(token);

    return { user, role, supabase, token };
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
