"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import dynamic from "next/dynamic";

const FactoryReportsSection = dynamic(
  () => import("@/components/FactoryReportsSection"),
  { loading: () => null },
);

const QAEvaluationsSection = dynamic(
  () => import("@/components/QAEvaluationsSection"),
  { loading: () => null },
);

const QAReportSection = dynamic(() => import("@/components/QAReportSection"), {
  loading: () => null,
});

type Tab = "fabrica" | "qa" | "qa-report";

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const isLead = profile?.is_lead === true;

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = searchParams.get("tab");
    if (tab === "qa") return "qa";
    if (tab === "qa-report") return "qa-report";
    return "fabrica";
  });

  // Sincronizar activeTab con cambios externos de URL (back/forward)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "qa") setActiveTab("qa");
    else if (tab === "qa-report") setActiveTab("qa-report");
    else setActiveTab("fabrica");
  }, [searchParams]);

  // Redirigir a login si no hay sesión
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  // Si cargó el perfil y no es lead, forzar pestaña fabrica
  useEffect(() => {
    if (
      !authLoading &&
      profile &&
      !isLead &&
      (activeTab === "qa" || activeTab === "qa-report")
    ) {
      setActiveTab("fabrica");
      router.replace("/reports?tab=fabrica", { scroll: false });
    }
  }, [authLoading, profile, isLead, activeTab, router]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams();
    params.set("tab", tab);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-4">
            Reportes
          </h1>
          <div className="flex gap-1 border-b border-gray-200">
            <button
              onClick={() => handleTabChange("fabrica")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "fabrica"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Reportes de Fábrica
            </button>
            {isLead && (
              <button
                onClick={() => handleTabChange("qa")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "qa"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Evaluaciones de QA
              </button>
            )}
            {isLead && (
              <button
                onClick={() => handleTabChange("qa-report")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "qa-report"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Reportes de QA
              </button>
            )}
          </div>
        </div>

        {activeTab === "fabrica" || !isLead ? (
          <FactoryReportsSection />
        ) : activeTab === "qa" ? (
          <QAEvaluationsSection />
        ) : (
          <QAReportSection />
        )}
      </main>
    </>
  );
}
