'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, HelpCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import TourSelectionModal from '@/components/TourSelectionModal';
import dynamic from 'next/dynamic';

const QueueStatusIndicator = dynamic(
  () => import('@/components/QueueStatusIndicator'),
  { ssr: false }
);

const NAV_LINKS = [
  { href: '/tasks', label: 'Tareas' },
  { href: '/reports', label: 'Reportes' },
  { href: '/timings', label: 'Tiempos' },
  { href: '/audit-trail', label: 'Auditoría' },
];

function Navbar() {
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const pathname = usePathname();
  const { user, profile, loading, isLoggingOut, signOut } = useAuth();

  if (isLoggingOut || loading) return null;

  return (
    <nav
      className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50 shadow-lg shadow-black/30 backdrop-blur-sm"
      aria-label="Navegación principal"
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand + Navigation */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="Inicio">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-gray-50 text-xs font-black tracking-tighter leading-none">QA</span>
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900 hidden sm:block">
              Evaluador de Tareas
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-blue-600 rounded-full" />
                  )}
                </Link>
              );
            })}
            {profile?.role === 'admin' && (
              <Link
                href="/settings"
                className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  pathname === '/settings'
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                Configuración
                {pathname === '/settings' && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-0.5 bg-blue-600 rounded-full" />
                )}
              </Link>
            )}
          </div>
        </div>

        {/* User section */}
        {user && (
          <div className="flex items-center gap-3">
            {/* Indicador de sincronización en segundo plano */}
            <QueueStatusIndicator />
            {/* User info */}
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-xs text-gray-600 leading-tight">{user.email}</span>
              {profile && (
                <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 leading-tight mt-0.5">
                  {profile.role}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-200 hidden sm:block" />

            {profile?.role === 'admin' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTourModalOpen(true)}
                title="Iniciar una visita guiada"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="hidden md:block">Tour</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={isLoggingOut}
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Salir</span>
            </Button>
          </div>
        )}
      </div>

      <TourSelectionModal
        isOpen={isTourModalOpen}
        onClose={() => setIsTourModalOpen(false)}
      />
    </nav>
  );
}

export default memo(Navbar);
