"use client";

import { AlertCircle, X } from "lucide-react";
import { useState } from "react";

/**
 * Banner informativo transversal que indica al usuario cómo proceder
 * en caso de comportamientos inesperados o falta de carga de datos
 */
export default function CacheWarningBanner() {
  const [isVisible, setIsVisible] = useState(true);

  const handleClearCacheAndRefresh = () => {
    // Limpiar caché del navegador
    localStorage.clear();
    sessionStorage.clear();

    // Limpiar caché de Supabase si existe
    if (typeof window !== "undefined" && "caches" in window) {
      caches.keys().then((cacheNames) => {
        cacheNames.forEach((cacheName) => {
          caches.delete(cacheName);
        });
      });
    }

    // Refrescar la página
    window.location.reload();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4 rounded-sm shadow-sm fade-in-smooth">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-blue-900">
            Si experimentas comportamientos inesperados o los datos no cargan
            correctamente, intenta{" "}
            <button
              onClick={handleClearCacheAndRefresh}
              className="font-semibold underline hover:text-blue-700 transition-colors"
            >
              borrar la caché y refrescar
            </button>
            . Esto eliminará los datos almacenados localmente y recargará la
            página.
          </p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-blue-600 hover:text-blue-800 transition-colors"
          title="Cerrar"
          aria-label="Cerrar mensaje"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
