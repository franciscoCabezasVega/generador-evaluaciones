import { supabase } from "@/lib/supabase";
import { getCurrentUserViaManager } from "@/lib/fetchAuth";
import { Task, CreateTaskInput, TaskSquad } from "@/lib/types";

export const taskService = {
  // Obtener tareas con filtros - optimizado para evitar queries múltiples
  // Ahora primero obtiene task_squad con filtros, luego tareas en UNA sola query
  async getTasks(filters: {
    month?: number;
    year?: number;
    squad?: string;
    status?: string;
  }) {
    try {
      // Paso 1: Obtener task_squad con filtro de squad si existe
      let squadQuery = supabase.from("task_squad").select("task_id, *");

      if (filters.squad) {
        squadQuery = squadQuery.eq("squad", filters.squad);
      }

      const { data: squadsData, error: squadsError } = await squadQuery;

      if (squadsError && squadsError.code !== "PGRST116") {
        throw squadsError;
      }

      if (!squadsData || squadsData.length === 0) {
        return [];
      }

      // Paso 2: Obtener todas las tareas en UNA sola query
      const taskIds = [
        ...new Set((squadsData as TaskSquad[]).map((s) => s.task_id)),
      ];

      let tasksQuery = supabase.from("tasks").select("*").in("id", taskIds);

      if (filters.month !== undefined) {
        tasksQuery = tasksQuery.eq("month", filters.month);
      }
      if (filters.year !== undefined) {
        tasksQuery = tasksQuery.eq("year", filters.year);
      }
      if (filters.status) {
        tasksQuery = tasksQuery.eq("status", filters.status);
      }

      const { data: tasksData, error: tasksError } = await tasksQuery.order(
        "created_at",
        {
          ascending: false,
        },
      );

      if (tasksError) throw tasksError;

      // Paso 3: Combinar en resultado final
      return (tasksData as Task[]).map((task) => ({
        ...task,
        squads: (squadsData as TaskSquad[]).filter(
          (sq) => sq.task_id === task.id,
        ),
      }));
    } catch (error) {
      console.error("Error in getTasks:", error);
      throw error;
    }
  },

  // Obtener una tarea por ID con sus squads
  async getTaskById(id: string) {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (taskError) throw taskError;

    const { data: squadsData, error: squadsError } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    if (squadsError && squadsError.code !== "PGRST116") {
      throw squadsError;
    }

    return {
      ...task,
      squads: (squadsData as TaskSquad[]) || [],
    };
  },

  // Crear tarea
  async createTask(input: CreateTaskInput) {
    const {
      data: { user },
      error: authError,
    } = await getCurrentUserViaManager();

    if (authError || !user) throw new Error("Usuario no autenticado");

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        name: input.name,
        task_link: input.task_link,
        product_type: input.product_type,
        status: input.status,
        month: input.month,
        year: input.year,
        user_id: user.id,
        assigned_qa: Array.isArray(input.assigned_qa) ? input.assigned_qa : [],
      })
      .select("id, name")
      .single();

    if (error) throw error;

    // Crear registros en task_squad
    const { calculateTaskScore } = await import("@/lib/scoreCalculator");
    const squadRecords = input.squads.map((squadData) => {
      const calculatedScore = calculateTaskScore({
        lowReturns: squadData.low_returns,
        mediumReturns: squadData.medium_returns,
        highReturns: squadData.high_returns,
      });
      return {
        task_id: data.id,
        squad: squadData.squad,
        low_returns: squadData.low_returns,
        medium_returns: squadData.medium_returns,
        high_returns: squadData.high_returns,
        additional_notes: squadData.additional_notes || "",
        calculated_score: calculatedScore,
      };
    });

    const { error: squadError } = await supabase
      .from("task_squad")
      .insert(squadRecords);

    if (squadError) throw squadError;

    return {
      ...data,
      squads: squadRecords.map((sr) => ({
        ...sr,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    };
  },

  // Actualizar tarea
  async updateTask(id: string, input: Partial<CreateTaskInput>) {
    const { squads, ...taskUpdateData } = input;

    const { data, error } = await supabase
      .from("tasks")
      .update({
        ...taskUpdateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Si se proporcionan squads, actualizar task_squad
    if (squads && squads.length > 0) {
      const { calculateTaskScore } = await import("@/lib/scoreCalculator");

      for (const squadData of squads) {
        const calculatedScore = calculateTaskScore({
          lowReturns: squadData.low_returns,
          mediumReturns: squadData.medium_returns,
          highReturns: squadData.high_returns,
        });

        await supabase.from("task_squad").upsert(
          {
            task_id: id,
            squad: squadData.squad,
            low_returns: squadData.low_returns,
            medium_returns: squadData.medium_returns,
            high_returns: squadData.high_returns,
            additional_notes: squadData.additional_notes || "",
            calculated_score: calculatedScore,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "task_id,squad",
          },
        );
      }
    }

    // Obtener squads actualizados
    const { data: squadsData } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    return {
      ...data,
      squads: (squadsData as TaskSquad[]) || [],
    };
  },

  // Eliminar tarea
  async deleteTask(id: string) {
    // Eliminar task_squad records
    await supabase.from("task_squad").delete().eq("task_id", id);

    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) throw error;
  },

  // Obtener tareas completadas para un equipo en un mes
  async getCompletedTasksBySquadAndMonth(
    squad: string,
    month: number,
    year: number,
  ) {
    // Obtener task_squad records para este squad
    const { data: squadsData, error: squadsError } = await supabase
      .from("task_squad")
      .select(
        "task_id, squad, low_returns, medium_returns, high_returns, calculated_score",
      )
      .eq("squad", squad);

    if (squadsError) throw squadsError;

    if (!squadsData || squadsData.length === 0) {
      return [];
    }

    const taskIds = [
      ...new Set((squadsData as TaskSquad[]).map((sq) => sq.task_id)),
    ];

    // Obtener tareas completadas en este mes/año en UNA SOLA query
    const { data: tasksData, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .in("id", taskIds)
      .eq("month", month)
      .eq("year", year)
      .eq("status", "Completada");

    if (tasksError) throw tasksError;

    // Combinar datos
    return (tasksData as Task[]).map((task) => ({
      ...task,
      squads: (squadsData as TaskSquad[]).filter(
        (sq) => sq.task_id === task.id && sq.squad === squad,
      ),
    }));
  },
};
