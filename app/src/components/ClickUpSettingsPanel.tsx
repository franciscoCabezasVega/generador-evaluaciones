"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Loader2, Trash2 } from "lucide-react";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";

interface ClickUpStatus {
  hasKey: boolean;
  updatedAt: string | null;
}

/**
 * Panel de configuración de la integración ClickUp.
 * Permite guardar, actualizar y eliminar la API key de ClickUp.
 * Solo accesible por admins (la restricción se aplica también en el backend).
 */
export default function ClickUpSettingsPanel() {
  const { safeFetch } = useSafeAuthFetch();

  const [status, setStatus] = useState<ClickUpStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch current status on mount
  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await safeFetch("/api/settings/clickup");
        if (res.ok) {
          const data = await res.json() as ClickUpStatus;
          setStatus(data);
        }
      } catch {
        // Non-critical; user can still attempt to save
      } finally {
        setLoadingStatus(false);
      }
    }
    void loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await safeFetch("/api/settings/clickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await res.json() as { success?: boolean; error?: string; updatedAt?: string };

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Error al guardar la clave" });
        return;
      }

      setStatus({ hasKey: true, updatedAt: data.updatedAt ?? new Date().toISOString() });
      setApiKey("");
      setMessage({ type: "success", text: "Clave de ClickUp guardada correctamente." });
    } catch {
      setMessage({ type: "error", text: "Error de conexión. Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const res = await safeFetch("/api/settings/clickup", { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setMessage({ type: "error", text: data.error ?? "Error al eliminar la clave" });
        return;
      }

      setStatus({ hasKey: false, updatedAt: null });
      setConfirmDelete(false);
      setMessage({ type: "success", text: "Clave de ClickUp eliminada. Todos los syncs han sido desactivados." });
    } catch {
      setMessage({ type: "error", text: "Error de conexión. Intenta de nuevo." });
    } finally {
      setDeleting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Cargando estado de integración...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        {status?.hasKey ? (
          <>
            <CheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-800">API key configurada</p>
              {status.updatedAt && (
                <p className="text-xs text-gray-500">
                  Última actualización:{" "}
                  {new Date(status.updatedAt).toLocaleString("es-EC", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <XCircle size={20} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              No hay API key configurada. Sin ella, la sincronización con ClickUp está inactiva.
            </p>
          </>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="clickup-api-key"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {status?.hasKey ? "Reemplazar API key de ClickUp" : "API key de ClickUp"}
          </label>
          <input
              id="clickup-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          <p className="text-xs text-gray-500 mt-1">
            Encuéntrala en ClickUp → Configuración → Apps → API token.
            La clave se almacena cifrada en la base de datos.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving || !apiKey.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {status?.hasKey ? "Actualizar clave" : "Guardar clave"}
        </button>
      </form>

      {/* Delete */}
      {status?.hasKey && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">Zona de peligro</p>
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-600">
                ¿Confirmas? Esto desactivará todos los syncs activos.
              </p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                Sí, eliminar
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-red-300 hover:border-red-500 text-red-600 hover:text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition"
            >
              <Trash2 size={14} />
              Eliminar clave de ClickUp
            </button>
          )}
        </div>
      )}

      {/* Feedback message */}
      {message && (
        <div
          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <XCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
          )}
          {message.text}
        </div>
      )}
    </div>
  );
}
