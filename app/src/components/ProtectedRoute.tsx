"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SkeletonLine } from "./Skeleton";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string | string[];
}

/**
 * Componente para proteger rutas que requieren autenticación
 *
 * Uso:
 * ```
 * <ProtectedRoute requiredRole="admin">
 *   <YourComponent />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { user, loading, profile } = useAuth();
  const router = useRouter();

  // Si aún está cargando, mostrar skeleton loading
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <SkeletonLine className="w-full h-10" />
        <SkeletonLine className="w-full h-8" />
        <SkeletonLine className="w-3/4 h-8" />
      </div>
    );
  }

  // Si no hay usuario, redirigir a login
  if (!user) {
    router.push("/auth/login");
    return null;
  }

  // Si se requiere un rol específico, validar
  if (requiredRole && profile) {
    const hasRequiredRole = Array.isArray(requiredRole)
      ? requiredRole.includes(profile.role || "")
      : profile.role === requiredRole;

    if (!hasRequiredRole) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-2">
              Acceso Denegado
            </h1>
            <p className="text-gray-600 mb-4">
              No tienes permiso para acceder a esta página
            </p>
            <button
              onClick={() => router.push("/tasks")}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Volver a Tareas
            </button>
          </div>
        </div>
      );
    }
  }

  // Usuario autenticado y autorizado
  return <>{children}</>;
}
