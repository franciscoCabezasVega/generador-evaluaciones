"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import CatalogManager, {
  CatalogItem,
  FieldDef,
} from "@/components/CatalogManager";
import {
  CatalogComplexity,
  CatalogSquad,
  CatalogTimingCategory,
} from "@/lib/types";
import { authenticatedFetch } from "@/lib/fetchAuth";
import { invalidateCatalogCache } from "@/hooks/useCatalogData";
import CacheWarningBanner from "@/components/CacheWarningBanner";
import ClickUpSettingsPanel from "@/components/ClickUpSettingsPanel";
import { AlertCircle, RefreshCw } from "lucide-react";

// ─── Tipos de tab ─────────────────────────────────────────────────────────────
type TabId =
  | "products"
  | "project-types"
  | "complexities"
  | "squads"
  | "qa-members"
  | "timing-categories"
  | "integrations";

const TABS: { id: TabId; label: string }[] = [
  { id: "products", label: "Productos" },
  { id: "project-types", label: "Tipos de Proyecto" },
  { id: "complexities", label: "Complejidad" },
  { id: "squads", label: "Squads" },
  { id: "qa-members", label: "QA Members" },
  { id: "timing-categories", label: "Categorías de Tiempo" },
  { id: "integrations", label: "Integraciones" },
];

// ─── Definición de campos por entidad ────────────────────────────────────────

const PRODUCT_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Nombre",
    type: "text",
    placeholder: "Ej: Platform",
    required: true,
  },
];

const PROJECT_TYPE_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Nombre",
    type: "text",
    placeholder: "Ej: Bug fix",
    required: true,
  },
];

const COMPLEXITY_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Nombre",
    type: "text",
    placeholder: "Ej: Estándar",
    required: true,
  },
  {
    key: "min_hours",
    label: "Horas mínimas",
    type: "number",
    min: 0,
    required: true,
  },
  {
    key: "max_hours",
    label: "Horas máximas",
    type: "number",
    min: 0,
    required: true,
  },
  {
    key: "display_order",
    label: "Orden de visualización",
    type: "number",
    min: 1,
    description: "Posición en el selector (1 = primero)",
  },
];

const QA_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Nombre completo",
    type: "text",
    placeholder: "Ej: Ana García",
    required: true,
  },
  {
    key: "clickup_user_id",
    label: "ClickUp User ID",
    type: "text",
    placeholder: "Ej: 12345678 (opcional)",
    description: "ID numérico del miembro en ClickUp. Requerido para sincronizar tiempos automáticamente.",
  },
];

const TIMING_CATEGORY_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Nombre",
    type: "text",
    placeholder: "Ej: Reuniones diarias",
    required: true,
  },
  {
    key: "hex_color",
    label: "Color",
    type: "color",
    required: true,
  },
  {
    key: "display_order",
    label: "Orden",
    type: "number",
    min: 1,
    required: true,
    description: "Posición en formularios (1 = primero)",
  },
  // is_system es solo lectura: el backend lo ignora en PATCH y lo fuerza a false en POST
];

// ─── Página ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("products");

  // Datos por tab
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [projectTypes, setProjectTypes] = useState<CatalogItem[]>([]);
  const [complexities, setComplexities] = useState<CatalogComplexity[]>([]);
  const [squads, setSquads] = useState<CatalogSquad[]>([]);
  const [qaMembers, setQaMembers] = useState<CatalogItem[]>([]);
  const [timingCategories, setTimingCategories] = useState<
    CatalogTimingCategory[]
  >([]);

  const [loadingTab, setLoadingTab] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  // Redirigir si no es admin
  useEffect(() => {
    if (!authLoading && profile && profile.role !== "admin") {
      router.replace("/tasks");
    }
  }, [authLoading, profile, router]);

  // ─── Fetch para el tab activo ──────────────────────────────────────────────

  const fetchTab = async (tab: TabId, retryCount = 0) => {
    // El tab de integraciones gestiona su propio estado
    if (tab === "integrations") {
      setTabError(null);
      return;
    }

    setLoadingTab(true);
    setTabError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await authenticatedFetch(
        `/api/settings/${tab}?includeInactive=true`,
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        setTabError(data.error ?? "Error al cargar datos");
        return;
      }
      switch (tab) {
        case "products":
          setProducts(data);
          break;
        case "project-types":
          setProjectTypes(data);
          break;
        case "complexities":
          setComplexities(data);
          break;
        case "squads":
          setSquads(data);
          break;
        case "qa-members":
          setQaMembers(data);
          break;
        case "timing-categories":
          setTimingCategories(data);
          break;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const isLock =
        err instanceof Error &&
        (err.name === "SessionLockError" || err.message.includes("ocupada"));
      // Un solo reintento para errores transitorios (timeout o lock).
      // Sin límite habría un loop infinito si el backend no responde.
      if ((isAbort || isLock) && retryCount === 0) {
        setTimeout(() => fetchTab(tab, 1), 2000);
        return;
      }
      setTabError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoadingTab(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      fetchTab(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, authLoading, profile?.role]);

  const handleRefresh = () => {
    invalidateCatalogCache();
    fetchTab(activeTab);
  };

  // ─── Campos de Squad: necesita opciones de productos ──────────────────────
  const squadFields: FieldDef[] = [
    {
      key: "name",
      label: "Nombre del Squad",
      type: "text",
      placeholder: "Ej: Squad 1 - Alpha",
      required: true,
    },
    {
      key: "product_id",
      label: "Producto",
      type: "select",
      required: true,
      options: products
        .filter((p) => p.is_active)
        .map((p) => ({ value: p.id, label: p.name })),
    },
  ];

  // ─── Columnas extra ────────────────────────────────────────────────────────

  const complexityExtraColumns = [
    {
      header: "Horas",
      render: (item: CatalogItem) => {
        const c = item as unknown as CatalogComplexity;
        const hoursLabel =
          c.min_hours === c.max_hours
            ? `${c.min_hours}h`
            : `${c.min_hours}h - ${c.max_hours}h`;
        return <span className="text-xs text-gray-500">{hoursLabel}</span>;
      },
    },
    {
      header: "Orden",
      render: (item: CatalogItem) => {
        const c = item as unknown as CatalogComplexity;
        return (
          <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
            {c.display_order}
          </span>
        );
      },
    },
  ];

  const squadExtraColumns = [
    {
      header: "Producto",
      render: (item: CatalogItem) => {
        const s = item as unknown as CatalogSquad;
        return (
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
            {s.product?.name ?? "—"}
          </span>
        );
      },
    },
  ];

  const timingCategoryExtraColumns = [
    {
      header: "Color",
      render: (item: CatalogItem) => {
        const c = item as unknown as CatalogTimingCategory;
        return (
          <span
            className="inline-block w-6 h-6 rounded border border-gray-300"
            style={{ backgroundColor: c.hex_color }}
            title={c.hex_color}
          />
        );
      },
    },
    {
      header: "Orden",
      render: (item: CatalogItem) => {
        const c = item as unknown as CatalogTimingCategory;
        return (
          <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
            {c.display_order}
          </span>
        );
      },
    },
    {
      header: "Tipo",
      render: (item: CatalogItem) => {
        const c = item as unknown as CatalogTimingCategory;
        return c.is_system ? (
          <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
            Sistema
          </span>
        ) : (
          <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
            Custom
          </span>
        );
      },
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <>
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-32">
            <p className="text-gray-500 text-sm">Cargando...</p>
          </div>
        </main>
      </>
    );
  }

  if (!profile || profile.role !== "admin") return null;

  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <CacheWarningBanner show={!!tabError} />
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Configuración</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestiona los catálogos que se usan en toda la aplicación
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loadingTab}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
            title="Recargar tab actual"
          >
            <RefreshCw size={16} className={loadingTab ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          {/* Tabs */}
          <div className="border-b bg-gray-50 px-6 pt-4">
            <nav className="flex gap-1" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "text-blue-600 border-blue-600 bg-white"
                      : "text-gray-500 border-transparent hover:text-gray-800 hover:bg-white/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Contenido del tab */}
          <div className="p-6">
            {tabError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <AlertCircle
                  size={16}
                  className="text-red-500 mt-0.5 flex-shrink-0"
                />
                <p className="text-sm text-red-700">{tabError}</p>
              </div>
            )}

            {loadingTab ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-gray-400 text-sm">Cargando...</p>
              </div>
            ) : (
              <>
                {activeTab === "products" && (
                  <CatalogManager
                    title="Productos"
                    apiPath="/api/settings/products"
                    items={products}
                    fields={PRODUCT_FIELDS}
                    onRefresh={handleRefresh}
                    itemLabel="producto"
                  />
                )}
                {activeTab === "project-types" && (
                  <CatalogManager
                    title="Tipos de Proyecto"
                    apiPath="/api/settings/project-types"
                    items={projectTypes}
                    fields={PROJECT_TYPE_FIELDS}
                    onRefresh={handleRefresh}
                    itemLabel="tipo de proyecto"
                  />
                )}
                {activeTab === "complexities" && (
                  <CatalogManager
                    title="Complejidades"
                    apiPath="/api/settings/complexities"
                    items={complexities as unknown as CatalogItem[]}
                    fields={COMPLEXITY_FIELDS}
                    onRefresh={handleRefresh}
                    extraColumns={complexityExtraColumns}
                    itemLabel="complejidad"
                  />
                )}
                {activeTab === "squads" && (
                  <CatalogManager
                    title="Squads"
                    apiPath="/api/settings/squads"
                    items={squads as unknown as CatalogItem[]}
                    fields={squadFields}
                    onRefresh={handleRefresh}
                    extraColumns={squadExtraColumns}
                    itemLabel="squad"
                  />
                )}
                {activeTab === "qa-members" && (
                  <CatalogManager
                    title="Miembros QA"
                    apiPath="/api/settings/qa-members"
                    items={qaMembers}
                    fields={QA_FIELDS}
                    onRefresh={handleRefresh}
                    itemLabel="miembro QA"
                  />
                )}
                {activeTab === "timing-categories" && (
                  <CatalogManager
                    title="Categorías de Tiempo"
                    apiPath="/api/settings/timing-categories"
                    items={timingCategories as unknown as CatalogItem[]}
                    fields={TIMING_CATEGORY_FIELDS}
                    onRefresh={handleRefresh}
                    extraColumns={timingCategoryExtraColumns}
                    itemLabel="categoría de tiempo"
                    isProtected={(item) =>
                      Boolean(
                        (item as unknown as CatalogTimingCategory).is_system,
                      )
                    }
                    protectedMessage="Las categorías del sistema no pueden eliminarse; desactívalas en su lugar"
                  />
                )}
                {activeTab === "integrations" && (
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 mb-1">
                      Integración ClickUp
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">
                      Configura la API key de ClickUp para sincronizar tiempos
                      de tareas automáticamente vía el cron job horario.
                    </p>
                    <ClickUpSettingsPanel />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
