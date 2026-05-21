import { createClient, LockFunc, processLock } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key");
}

// Wrapper de processLock que siempre pasa acquireTimeout=-1.
//
// PROBLEMA RAÍZ: _initSupabaseAuthClient en supabase-js solo reenvía un
// subconjunto de opciones al GoTrueClient y omite `lockAcquireTimeout`.
// El default del GoTrueClient es 10000ms, lo que genera el warning
// "Lock acquisition timed out after 10000ms" cuando hay operaciones en cola.
//
// La solución: pasar el acquireTimeout=-1 directamente en la llamada a
// processLock. Con -1, processLock nunca crea el setTimeout del warning.
// Las operaciones siguen usando la cola FIFO en memoria (comportamiento
// correcto), solo se elimina el timer artificial que causa el warning.
const processLockNoTimeout: LockFunc = (name, _acquireTimeout, fn) =>
  processLock(name, -1, fn);

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
    lock: processLockNoTimeout,
  },
});
