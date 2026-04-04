'use client';

import { useState, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, HelpCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import TourSelectionModal from '@/components/TourSelectionModal';

function Navbar() {
  const [isTourModalOpen, setIsTourModalOpen] = useState(false);
  const pathname = usePathname();
  const { user, profile, loading, isLoggingOut, signOut } = useAuth();

  if (isLoggingOut || loading) return null;

  return (
    <nav className="border-b bg-white" aria-label="Navegación principal" data-testid="navbar">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold">Evaluador de Tareas</h1>
          <div className="flex gap-4">
            <Link
              href="/tasks"
              className={`transition-colors font-medium ${
                pathname === '/tasks'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Tareas
            </Link>
            <Link
              href="/reports"
              className={`transition-colors font-medium ${
                pathname === '/reports'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Reportes
            </Link>
            <Link
              href="/timings"
              className={`transition-colors font-medium ${
                pathname === '/timings'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Tiempos
            </Link>
            <Link
              href="/audit-trail"
              className={`transition-colors font-medium ${
                pathname === '/audit-trail'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              Auditoría
            </Link>
            {profile?.role === 'admin' && (
              <Link
                href="/settings"
                className={`transition-colors font-medium ${
                  pathname === '/settings'
                    ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                Configuración
              </Link>
            )}
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm text-gray-600">{user.email}</span>
              {profile && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {profile.role}
                </span>
              )}
              {loading && (
                <span className="text-xs text-gray-400">cargando...</span>
              )}
            </div>
            {profile?.role === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTourModalOpen(true)}
                className="gap-2"
                title="Iniciar una visita guiada"
              >
                <HelpCircle className="w-4 h-4" />
                Tour
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={isLoggingOut}
              className="gap-2"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </Button>
          </div>
        )}
        
        <TourSelectionModal 
          isOpen={isTourModalOpen} 
          onClose={() => setIsTourModalOpen(false)} 
        />
      </div>
    </nav>
  );
}

export default memo(Navbar);
