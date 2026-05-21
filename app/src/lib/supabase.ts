import { createClient, processLock } from "@supabase/supabase-js";

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
    // Por defecto lockAcquireTimeout es 10000ms. Si una operación en la cola
    // espera >10s (p. ej. auto-refresh tarda), las siguientes hacen timeout.
    // Con processLock (in-memory FIFO) las operaciones siempre terminan, así
    // que esperar indefinidamente es seguro y elimina los warnings del browser.
    lockAcquireTimeout: -1,
  },
});
