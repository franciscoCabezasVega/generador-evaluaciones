'use client';

import { ReactNode, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface AuthErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Componente que detecta y maneja errores de refresh token
 * Se ejecuta en el cliente para interceptar errores de autenticación
 */
export function AuthErrorBoundary({ children }: AuthErrorBoundaryProps) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useLayoutEffect(() => {
    // Para evitar hydration mismatch, marcar como montado después que el cliente renderice
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    // Escuchar cambios en la sesión y detectar errores
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Solo redirigir en un cierre de sesión EXPLÍCITO sin sesión residual.
        // Esto evita falsos positivos por eventos transitorios durante
        // el refresh de token o al restaurar la pestaña del navegador.
        if (event === 'SIGNED_OUT' && session === null) {
          console.warn('Session cleared - user was signed out');
          router.push('/auth/login');
        }
        
        // TOKEN_REFRESHED sin sesión indica un fallo real de refresh
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn('Token refresh failed');
          router.push('/auth/login');
        }
      }
    );

    // Manejar posibles errores de refresh token de forma global
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.includes('auth') && e.newValue === null) {
        console.warn('Auth tokens cleared from storage');
        router.push('/auth/login');
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      subscription?.unsubscribe();
    };
  }, [router]);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}
