import { createClient, processLock } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key");
}

/**
 * Cliente de Supabase singleton con sesión persistida en localStorage.
 *
 * IMPORTANTE: usamos `processLock` (in-memory) en vez del lock por defecto
 * (`navigatorLock`, basado en `navigator.locks`). En producción observamos
 * que `navigator.locks` se queda colgado tras refreshes fallidos / tabs
 * inactivos, atrapando todas las llamadas posteriores en un loop infinito
 * de "Session lock timeout".
 *
 * processLock es el patrón oficial recomendado por Supabase para SPAs
 * donde la coordinación cross-tab no es crítica:
 *   - SessionManager ya hace coalescing in-memory (1 llamada en vuelo).
 *   - BroadcastChannel sincroniza invalidaciones entre tabs.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    lock: processLock,
    // NOTA sobre `lockAcquireTimeout`: lo dejamos en su default (0 ms).
    // Cuando dos llamadas piden el lock a la vez supabase-js loggea un
    // warning "Lock acquisition timed out after 0ms" pero NO bloquea:
    // la segunda llamada cae al `localStorage` cache de gotrue y sigue.
    // Subir el timeout (probamos 10 s) hace que las llamadas se queden
    // colgadas esperando, lo cual es estrictamente peor. SessionManager
    // ya coalescing en memoria, así que el warning es cosmético.
  },
});

/**
 * Middleware helper para actualizar la sesión de Supabase
 * Necessary for server-side auth to work properly
 */
export async function updateSession(request: NextRequest) {
  try {
    // Create an unmodified response
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Refresh the auth token if it exists
    const token = request.cookies.get(
      "sb-" + supabaseUrl?.split("//")[1]?.split(".")[0] + "-auth-token",
    );

    if (token) {
      response.headers.set("x-supabase-auth", token.value);
    }

    return response;
  } catch (error) {
    // If you are here, a Supabase client could not be created!
    // Most likely your edge function is not configured with auth secrets
    // or you are trying to create a client in a context that doesn't allow it
    console.error("Auth middleware error:", error);
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
}
