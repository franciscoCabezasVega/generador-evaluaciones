import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("URL de Supabase o clave anon no configuradas");
}

/**
 * Cliente de Supabase singleton para el cliente (browser).
 *
 * IMPORTANTE: usamos createBrowserClient de @supabase/ssr para que los tokens
 * se persistan como cookies (además de localStorage). Esto es requerido para
 * que el middleware SSR (app/middleware.ts) pueda leer la sesión via getUser()
 * en cada request; el edge/SSR no tiene acceso a localStorage.
 *
 * autoRefreshToken: false — RefreshScheduler lo gestiona de forma proactiva;
 * tener dos mecanismos compitiendo introduciría contención de locks.
 * noOpLock eliminado: SessionStore garantiza que getSession() solo se llama
 * una vez en bootstrap, eliminando la contención que lo requería.
 *
 * Nota: @supabase/ssr v0.10 no expone autoRefreshToken en su tipo restringido
 * de auth, pero lo pasa al createClient() subyacente en runtime. El cast es
 * intencional y documentado aquí.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false, // RefreshScheduler lo gestiona de forma proactiva
    detectSessionInUrl: true,
    flowType: "pkce",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any, // by design: autoRefreshToken no está en el tipo público de createBrowserClient
});
