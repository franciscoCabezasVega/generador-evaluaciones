"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SessionStore } from "@/lib/auth/SessionStore";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Eye, EyeOff, X } from "lucide-react";

type SessionExpiredReason =
  | "timeout"
  | "inactive"
  | "error"
  | "refresh_failed"
  | "storage_cleared"
  | "unknown";

const REMEMBER_ME_KEY = "login_remembered_email";

/** Traduce mensajes de error de Supabase Auth (en inglés) al español. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid email or password")
  )
    return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed"))
    return "Debes confirmar tu correo electrónico antes de iniciar sesión.";
  if (m.includes("user not found"))
    return "No existe una cuenta con ese correo.";
  if (m.includes("too many requests") || m.includes("rate limit"))
    return "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
  if (m.includes("network") || m.includes("fetch"))
    return "Error de conexión. Verifica tu internet e intenta de nuevo.";
  if (m.includes("user banned") || m.includes("user is banned"))
    return "Tu cuenta ha sido suspendida. Contacta al administrador.";
  if (m.includes("password") && m.includes("weak"))
    return "La contraseña es demasiado débil.";
  if (m.includes("signup") && m.includes("disabled"))
    return "El registro de nuevas cuentas está deshabilitado.";
  if (!message) return "Error al iniciar sesión.";
  // Si ya está en español o no se reconoce, devolver como está
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);
  const [expiredReason, setExpiredReason] =
    useState<SessionExpiredReason>("unknown");

  // Pre-rellenar email si el usuario marcó "Recuérdame" anteriormente
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_ME_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Detectar si la sesión expiró
  useEffect(() => {
    const expired = searchParams.get("sessionExpired") === "true";
    const reason =
      (searchParams.get("reason") as SessionExpiredReason) || "unknown";
    if (expired) {
      setShowExpiredBanner(true);
      setExpiredReason(reason);
    } else {
      setShowExpiredBanner(false);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setShowExpiredBanner(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.session) throw new Error("No se pudo establecer la sesión");

      // Gestionar "Recuérdame"
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
      }

      // Esperar evento SIGNED_IN del store (event-driven, sin polling).
      // onAuthStateChange dispara SIGNED_IN tras signInWithPassword exitoso.
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          unsub();
          reject(
            new Error(
              "La sesión tardó demasiado en iniciarse. Intenta de nuevo.",
            ),
          );
        }, 10_000);

        const unsub = SessionStore.subscribe((snapshot) => {
          if (
            snapshot.status === "authenticated" &&
            snapshot.session?.user?.id
          ) {
            clearTimeout(timeoutId);
            unsub();
            const redirectTo = searchParams.get("redirectTo");
            // Guard against open-redirect: only allow relative paths
            const safeRedirect =
              redirectTo &&
              redirectTo.startsWith("/") &&
              !redirectTo.startsWith("//")
                ? redirectTo
                : "/";
            window.location.href = safeRedirect;
            resolve();
          }
        });
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMessage: string = (error as any).message || "";
      const translated = translateAuthError(rawMessage);
      setError(translated);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-gray-50 border-r border-gray-200 p-10 relative overflow-hidden">
        {/* Decorative grid background */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `linear-gradient(var(--color-gray-400) 1px, transparent 1px),
              linear-gradient(90deg, var(--color-gray-400) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-gray-50 font-black tracking-tighter text-sm">
              QA
            </span>
          </div>
          <span className="text-sm font-bold tracking-tight text-gray-900">
            Evaluador de Tareas
          </span>
        </div>

        {/* Center quote */}
        <div className="relative">
          <p className="text-3xl font-bold text-gray-900 leading-snug tracking-tight mb-4">
            Evaluaciones
            <br />
            <span className="text-blue-600">precisas</span>,<br />
            equipos mejores.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
            Plataforma de gestión y análisis de calidad para fábricas de
            software.
          </p>
        </div>

        {/* Footer stats */}
        <div className="relative flex gap-8">
          {[
            { label: "Módulos", value: "4" },
            { label: "Roles", value: "4" },
            { label: "Con IA", value: "✓" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-2xl font-bold text-gray-900 num">{value}</p>
              <p className="text-xs text-gray-600 uppercase tracking-widest">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 lg:hidden mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-gray-50 font-black tracking-tighter text-xs">
                QA
              </span>
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900">
              Evaluador de Tareas
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Iniciar sesión
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Ingresa tus credenciales para continuar.
            </p>
          </div>

          {/* Session expired banner */}
          {showExpiredBanner && (
            <div
              className="bg-amber-950/50 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3"
              role="alert"
              data-testid="session-expired-banner"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  {expiredReason === "inactive"
                    ? "Sesión cerrada por inactividad"
                    : "Tu sesión ha expirado"}
                </p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  Inicia sesión nuevamente para continuar.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowExpiredBanner(false);
                  router.replace("/auth/login");
                }}
                className="text-amber-500 hover:text-amber-300 transition-colors"
                aria-label="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="bg-red-950/50 border border-red-500/30 rounded-lg p-4 flex items-start gap-3"
              role="alert"
              data-testid="login-error"
            >
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleLogin}
            className="space-y-4"
            data-testid="login-form"
          >
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 text-sm"
                placeholder="tu@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2.5 text-sm pr-10"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Recuérdame */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none group w-fit">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                Recuérdame
              </span>
            </label>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-900/40 border-t-slate-900 rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : (
                "Iniciar sesión"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
