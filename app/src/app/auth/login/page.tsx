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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="w-full max-w-md space-y-4">

        {/* Formulario de login */}
        <div className="bg-white p-8 rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-6">Iniciar Sesión</h1>

          {showExpiredBanner && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6 flex items-start gap-3" role="alert" data-testid="session-expired-banner">
              <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-900">
                  {expiredReason === 'inactive' ? 'Sesión cerrada por inactividad' : 'Tu sesión ha expirado'}
                </p>
                <p className="text-sm text-yellow-800 mt-1">Por favor, inicia sesión nuevamente para continuar.</p>
              </div>
              <button
                onClick={() => { setShowExpiredBanner(false); router.replace('/auth/login'); }}
                className="text-yellow-700 hover:text-yellow-900 transition-colors"
                aria-label="Cerrar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3" role="alert" data-testid="login-error">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-2">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
                placeholder="tu@email.com"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium mb-2">Contraseña</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>
        </div>

        {/* Cuentas de prueba */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">🧪 Cuentas de prueba — Click para ingresar</p>
          </div>
          <div className="divide-y divide-gray-100">
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillCredentials(acc.email, acc.password)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{acc.email}</p>
                  <p className="text-xs text-gray-500">{acc.role}</p>
                </div>
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">{acc.password}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

