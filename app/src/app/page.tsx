'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { ClipboardList, BarChart3, Clock, Shield, Settings } from 'lucide-react';

const FEATURE_CARDS = [
  {
    href: '/tasks',
    icon: ClipboardList,
    label: 'Tareas',
    description: 'Crea, edita y gestiona las evaluaciones mensuales de tareas por squad.',
    accent: 'from-amber-500/20 to-amber-600/5',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    iconColor: 'text-amber-400',
  },
  {
    href: '/reports',
    icon: BarChart3,
    label: 'Reportes',
    description: 'Visualiza y descarga los reportes mensuales de desempeño con análisis IA.',
    accent: 'from-blue-500/20 to-blue-600/5',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    iconColor: 'text-blue-500',
  },
  {
    href: '/timings',
    icon: Clock,
    label: 'Tiempos',
    description: 'Registra y analiza métricas de tiempos de QA por tarea y sprint.',
    accent: 'from-emerald-500/20 to-emerald-600/5',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    iconColor: 'text-emerald-400',
  },
  {
    href: '/audit-trail',
    icon: Shield,
    label: 'Auditoría',
    description: 'Historial completo de acciones: creaciones, ediciones y eliminaciones.',
    accent: 'from-violet-500/20 to-violet-600/5',
    border: 'border-violet-500/20 hover:border-violet-500/40',
    iconColor: 'text-violet-400',
  },
];

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-12">

        {/* Hero section */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-gray-50 font-black text-sm tracking-tighter">QA</span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Evaluador de Tareas
            </span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
            Bienvenido{profile?.name ? <span className="text-blue-600">,{' '}{profile.name}</span> : profile?.role ? <span className="text-blue-600">,{' '}{profile.role}</span> : ''}
          </h1>
          <p className="text-gray-600 text-lg max-w-xl">
            Gestiona las evaluaciones mensuales de calidad para los equipos de fábrica.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {FEATURE_CARDS.map(({ href, icon: Icon, label, description, accent, border, iconColor }) => (
            <Link
              key={href}
              href={href}
              className={`group relative p-6 rounded-xl border bg-gray-100 bg-gradient-to-br ${accent} ${border} transition-all duration-200 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 active:translate-y-0 card-glow`}
            >
              <div className={`w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1.5">{label}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
                <span>Abrir</span>
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Admin quick-access */}
        {profile?.role === 'admin' && (
          <div className="border border-gray-200 rounded-xl p-5 bg-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                <Settings className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Configuración del sistema</p>
                <p className="text-xs text-gray-600">Gestiona productos, squads, categorías y miembros QA.</p>
              </div>
            </div>
            <Link
              href="/settings"
              className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              Ir a configuración →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}


