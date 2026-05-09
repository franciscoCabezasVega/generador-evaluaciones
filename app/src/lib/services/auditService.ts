import { supabase } from "@/lib/supabase";
import { AuditLog, CreateAuditLogInput } from "@/lib/types";

export const auditService = {
  /**
   * Registra una acción en el audit log
   */
  async logAction(input: CreateAuditLogInput): Promise<AuditLog | null> {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .insert({
          user_id: input.user_id,
          user_email: input.user_email,
          action: input.action,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          entity_name: input.entity_name,
          changes: input.changes,
          old_values: input.old_values,
          new_values: input.new_values,
          timestamp: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error logging audit action:", error);
        return null;
      }

      return data as AuditLog;
    } catch (error) {
      console.error("Error in auditService.logAction:", error);
      return null;
    }
  },

  /**
   * Obtiene el historial de auditoría con filtros
   */
  async getAuditLogs(filters: {
    entity_type?: "TASK" | "REPORT";
    entity_id?: string;
    user_id?: string;
    action?: "CREATE" | "UPDATE" | "DELETE";
    limit?: number;
    offset?: number;
  }) {
    try {
      let query = supabase.from("audit_logs").select("*", { count: "exact" });

      if (filters.entity_type) {
        query = query.eq("entity_type", filters.entity_type);
      }
      if (filters.entity_id) {
        query = query.eq("entity_id", filters.entity_id);
      }
      if (filters.user_id) {
        query = query.eq("user_id", filters.user_id);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }

      query = query.order("timestamp", { ascending: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 10) - 1,
        );
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data as AuditLog[]) || [],
        count: count || 0,
      };
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      throw error;
    }
  },

  /**
   * Obtiene el historial de cambios de una tarea específica
   */
  async getTaskAuditHistory(taskId: string) {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_id", taskId)
        .eq("entity_type", "TASK")
        .order("timestamp", { ascending: false });

      if (error) throw error;
      return (data as AuditLog[]) || [];
    } catch (error) {
      console.error("Error fetching task audit history:", error);
      throw error;
    }
  },

  /**
   * Obtiene el historial de cambios de un reporte específico
   */
  async getReportAuditHistory(reportId: string) {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_id", reportId)
        .eq("entity_type", "REPORT")
        .order("timestamp", { ascending: false });

      if (error) throw error;
      return (data as AuditLog[]) || [];
    } catch (error) {
      console.error("Error fetching report audit history:", error);
      throw error;
    }
  },

  /**
   * Obtiene el historial de actividad de un usuario específico
   */
  async getUserActivityLog(userId: string, limit: number = 50) {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as AuditLog[]) || [];
    } catch (error) {
      console.error("Error fetching user activity log:", error);
      throw error;
    }
  },

  /**
   * Obtiene el cambio específico entre dos versiones
   */
  async getChangesBetweenVersions(
    entityId: string,
    entityType: "TASK" | "REPORT",
  ) {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .eq("action", "UPDATE")
        .order("timestamp", { ascending: false });

      if (error) throw error;
      return (data as AuditLog[]) || [];
    } catch (error) {
      console.error("Error fetching changes:", error);
      throw error;
    }
  },
};
