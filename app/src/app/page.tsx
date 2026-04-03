'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  }

  if (!user) {
    return null; // El useEffect redirigirá
  }

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-3xl font-bold mb-4">Bienvenido al Evaluador de Tareas</h1>
          <p className="text-gray-600 mb-6">
            Gestiona las evaluaciones mensuales de tareas por squad.
          </p>
          
          <div className="grid grid-cols-2 gap-6">
            <Link
              href="/tasks"
              className="p-6 border rounded-lg hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h2 className="text-xl font-semibold mb-2">📋 Tareas</h2>
              <p className="text-gray-600">Crea, edita y gestiona tareas</p>
            </Link>

            <Link
              href="/reports"
              className="p-6 border rounded-lg hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h2 className="text-xl font-semibold mb-2">📊 Reportes</h2>
              <p className="text-gray-600">Visualiza y descarga los reportes mensuales</p>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}


