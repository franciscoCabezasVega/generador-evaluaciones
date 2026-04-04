'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { invalidateSessionCache } from '@/lib/fetchAuth';
import { Button } from '@/components/ui/button';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';

type SessionExpiredReason = 'timeout' | 'inactive' | 'error' | 'unknown';

const TEST_ACCOUNTS = [
  { email: 'admin@evaluaciones.test',     password: 'Admin@2026Test!',     role: 'Admin' },
  { email: 'gestor@evaluaciones.test',    password: 'Gestor@2026Test!',    role: 'Gestor' },
  { email: 'reportero@evaluaciones.test', password: 'Reportero@2026Test!', role: 'Reportero' },
  { email: 'invitado@evaluaciones.test',  password: 'Invitado@2026Test!',  role: 'Invitado' },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);
  const [expiredReason, setExpiredReason] = useState<SessionExpiredReason>('unknown');

  // Detectar si la sesión expiró
  useEffect(() => {
    const expired = searchParams.get('sessionExpired') === 'true';
    const reason = (searchParams.get('reason') as SessionExpiredReason) || 'unknown';
    if (expired) {
      setShowExpiredBanner(true);
      setExpiredReason(reason);
    } else {
      setShowExpiredBanner(false);
    }
  }, [searchParams]);

  const fillCredentials = (userEmail: string, userPassword: string) => {
    setEmail(userEmail);
    setPassword(userPassword);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowExpiredBanner(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) throw error;
      if (!data.session) throw new Error('No se pudo establecer la sesión');

      invalidateSessionCache();

      let retries = 0;
      const maxRetries = 5;

      const waitForSessionReady = async (): Promise<void> => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            window.location.href = '/';
            return;
          }
        } catch {
          // Silently catch and retry
        }
        if (retries < maxRetries) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 600));
          await waitForSessionReady();
        } else {
          throw new Error('No se pudo validar la sesión después de múltiples intentos');
        }
      };

      await waitForSessionReady();
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((error as any).message || 'Error al iniciar sesión');
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
            backgroundSize: '40px 40px',
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-gray-50 font-black tracking-tighter text-sm">QA</span>
          </div>
          <span className="text-sm font-bold tracking-tight text-gray-900">Evaluador de Tareas</span>
        </div>

        {/* Center quote */}
        <div className="relative">
          <p className="text-3xl font-bold text-gray-900 leading-snug tracking-tight mb-4">
            Evaluaciones<br />
            <span className="text-blue-600">precisas</span>,<br />
            equipos mejores.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
            Plataforma de gestión y análisis de calidad para fábricas de software.
          </p>
        </div>

        {/* Footer stats */}
        <div className="relative flex gap-8">
          {[
            { label: 'Módulos', value: '4' },
            { label: 'Roles', value: '4' },
            { label: 'Con IA', value: '✓' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-2xl font-bold text-gray-900 num">{value}</p>
              <p className="text-xs text-gray-600 uppercase tracking-widest">{label}</p>
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
              <span className="text-gray-50 font-black tracking-tighter text-xs">QA</span>
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900">Evaluador de Tareas</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-gray-600 mt-1">Ingresa tus credenciales para continuar.</p>
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
                  {expiredReason === 'inactive' ? 'Sesión cerrada por inactividad' : 'Tu sesión ha expirado'}
                </p>
                <p className="text-xs text-amber-400/80 mt-0.5">Inicia sesión nuevamente para continuar.</p>
              </div>
              <button
                onClick={() => { setShowExpiredBanner(false); router.replace('/auth/login'); }}
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
          <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">
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
              <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 text-sm"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-900/40 border-t-slate-900 rounded-full animate-spin" />
                  Verificando...
                </span>
              ) : 'Iniciar sesión'}
            </Button>
          </form>

          {/* Test accounts */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-200">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                Cuentas de prueba — click para rellenar
              </p>
            </div>
            <div className="divide-y divide-gray-200">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillCredentials(acc.email, acc.password)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-200 transition-colors text-left group"
                >
                  <div>
                    <p className="text-xs font-medium text-gray-800">{acc.email}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mt-0.5">{acc.role}</p>
                  </div>
                  <span className="text-[10px] font-mono text-gray-500 bg-gray-200 group-hover:bg-gray-300 px-2 py-1 rounded transition-colors">
                    {acc.password}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

