import { supabase } from "@/lib/supabase";
import { getCurrentUserViaManager } from "@/lib/fetchAuth";
import { Report, CreateReportInput } from "@/lib/types";

export const reportService = {
  // Obtener reportes con filtros
  async getReports(filters: { squad?: string; month?: number; year?: number }) {
    let query = supabase.from("reports").select("*");

    if (filters.squad) {
      query = query.eq("squad", filters.squad);
    }
    if (filters.month !== undefined) {
      query = query.eq("month", filters.month);
    }
    if (filters.year !== undefined) {
      query = query.eq("year", filters.year);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) throw error;
    return data as Report[];
  },

  // Obtener un reporte específico
  async getReportById(id: string) {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Report;
  },

  // Obtener versiones de un reporte
  async getReportVersions(squad: string, month: number, year: number) {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("squad", squad)
      .eq("month", month)
      .eq("year", year)
      .order("version", { ascending: false });

    if (error) throw error;
    return data as Report[];
  },

  // Obtener la última versión de un reporte
  async getLatestReportVersion(squad: string, month: number, year: number) {
    const { data, error } = await supabase
      .from("reports")
      .select("version")
      .eq("squad", squad)
      .eq("month", month)
      .eq("year", year)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return (data as Report) || null;
  },

  // Crear nuevo reporte (con versionado automático)
  async createReport(input: CreateReportInput) {
    const {
      data: { user },
      error: authError,
    } = await getCurrentUserViaManager();

    if (authError || !user) throw new Error("Usuario no autenticado");

    // Obtener la última versión
    const lastReport = await this.getLatestReportVersion(
      input.squad,
      input.month,
      input.year,
    );

    const nextVersion = (lastReport?.version || 0) + 1;

    const { data, error } = await supabase
      .from("reports")
      .insert({
        ...input,
        version: nextVersion,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Report;
  },

  // Actualizar reporte
  async updateReport(id: string, input: Partial<CreateReportInput>) {
    const { data, error } = await supabase
      .from("reports")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Report;
  },
};
