import { supabase } from "@/lib/supabase";
import {
  TaskTiming,
  CreateTaskTimingInput,
  UpdateTaskTimingInput,
  SquadTimingMetrics,
  QATimingMetrics,
  TimingQAEntry,
} from "@/lib/types";

// Row shape from `task_timings_with_totals` view
interface TimingViewRow {
  id: string;
  task_id: string;
  month: number;
  year: number;
  effective_testing_hours: string;
  waiting_environment_hours: string;
  waiting_development_fixes_hours: string;
  retest_hours: string;
  clarification_hours: string;
  total_hours: string;
  created_at: string;
  [key: string]: unknown;
}

interface TaskIdRow {
  id: string;
}
interface TaskProductRow {
  id: string;
  product_type: string;
}
interface TaskInfoRow {
  id: string;
  name: string;
  task_link: string;
  status: string;
  product_type: string;
  created_at: string;
}

// Helper to create authenticated Supabase client
async function getClient(token?: string) {
  if (!token) return supabase;
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return supabase;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { authorization: `Bearer ${token}` } },
  });
}

// Name of the VIEW that aggregates hours from timing_qa_entries
const TIMINGS_VIEW = "task_timings_with_totals";

// Helper: build month/year range filter for Supabase queries
// Converts startDate/endDate to (year, month) compound OR conditions
function buildDateRangeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder has complex generics
  query: any,
  filters: {
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  },
) {
  // If legacy month/year provided (backward compat), use them directly
  if (
    filters.month !== undefined &&
    filters.year !== undefined &&
    !filters.startDate
  ) {
    query = query.eq("month", filters.month).eq("year", filters.year);
    return query;
  }

  // Date range filtering
  if (filters.startDate && filters.endDate) {
    // Parse ISO dates without timezone ambiguity
    // Format: "2026-03-01" → extract year, month, day directly
    const parseISODate = (
      dateStr: string,
    ): { year: number; month: number; day: number } => {
      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) {
        throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
      }
      return {
        year: parseInt(match[1], 10),
        month: parseInt(match[2], 10), // Already 1-indexed
        day: parseInt(match[3], 10),
      };
    };

    const startParsed = parseISODate(filters.startDate);
    const endParsed = parseISODate(filters.endDate);

    if (
      startParsed.year === endParsed.year &&
      startParsed.month === endParsed.month
    ) {
      // Same month — simple eq
      query = query.eq("year", startParsed.year).eq("month", startParsed.month);
    } else if (startParsed.year === endParsed.year) {
      // Same year, different months
      query = query
        .eq("year", startParsed.year)
        .gte("month", startParsed.month)
        .lte("month", endParsed.month);
    } else {
      // Spans multiple years — compound OR
      const conditions: string[] = [];
      for (let y = startParsed.year; y <= endParsed.year; y++) {
        const minM = y === startParsed.year ? startParsed.month : 1;
        const maxM = y === endParsed.year ? endParsed.month : 12;
        if (minM === maxM) {
          conditions.push(`and(year.eq.${y},month.eq.${minM})`);
        } else {
          conditions.push(
            `and(year.eq.${y},month.gte.${minM},month.lte.${maxM})`,
          );
        }
      }
      query = query.or(conditions.join(","));
    }
    return query;
  }

  // Fallback: apply individual filters
  if (filters.month !== undefined) query = query.eq("month", filters.month);
  if (filters.year !== undefined) query = query.eq("year", filters.year);
  return query;
}

// Helper: get task IDs whose effort_score_date falls within the given date range
async function getTaskIdsByEffortDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client typing
  client: any,
  startDate: string,
  endDate: string,
  extraFilters?: { product_type?: string },
): Promise<string[] | null> {
  let q = client
    .from("tasks")
    .select("id")
    .gte("effort_score_date", startDate)
    .lte("effort_score_date", endDate);
  if (extraFilters?.product_type) {
    q = q.eq("product_type", extraFilters.product_type);
  }
  const { data, error } = await q;
  if (error) throw error;
  if (!data || data.length === 0) return [];
  return (data as TaskIdRow[]).map((t) => t.id);
}

// Helper: Sincronizar assigned_qa en tasks desde task_qa
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client typing
async function syncAssignedQA(client: any, taskId: string): Promise<void> {
  try {
    // Obtener todos los qa_name únicos de task_qa para esta tarea
    const { data: qaData, error: qaError } = await client
      .from("task_qa")
      .select("qa_name")
      .eq("task_id", taskId);

    if (qaError) {
      console.error("Error fetching task_qa:", qaError);
      return;
    }

    // Extraer nombres únicos
    const qaNames = qaData
      ? Array.from(
          new Set(qaData.map((item: { qa_name: string }) => item.qa_name)),
        )
      : [];

    // Actualizar tasks.assigned_qa
    const { error: updateError } = await client
      .from("tasks")
      .update({ assigned_qa: qaNames })
      .eq("id", taskId);

    if (updateError) {
      console.error("Error updating assigned_qa:", updateError);
    }
  } catch (error) {
    console.error("Error in syncAssignedQA:", error);
  }
}

export const timingService = {
  // Obtener todos los tiempos con filtros (incluye QA entries)
  // Reads from VIEW for aggregated hours, raw table for QA entries
  async getTimings(
    filters: {
      month?: number;
      year?: number;
      startDate?: string;
      endDate?: string;
      task_id?: string;
      product_type?: string;
    },
    token?: string,
  ) {
    try {
      const client = await getClient(token);

      let query = client.from(TIMINGS_VIEW).select("*");

      // When date range is provided, filter by effort_score_date on tasks table
      if (filters.startDate && filters.endDate) {
        const taskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          {
            product_type: filters.product_type,
          },
        );
        if (!taskIds || taskIds.length === 0) return [];
        query = query.in("task_id", taskIds);
      } else {
        // Legacy month/year filtering on timings table
        query = buildDateRangeFilter(query, filters);

        // Filter by product_type separately when no date range
        if (filters.product_type) {
          const { data: matchingTasks } = await client
            .from("tasks")
            .select("id")
            .eq("product_type", filters.product_type);

          const matchingTaskIds = (matchingTasks || []).map(
            (t: TaskIdRow) => t.id,
          );
          if (matchingTaskIds.length === 0) return [];
          query = query.in("task_id", matchingTaskIds);
        }
      }

      if (filters.task_id) {
        query = query.eq("task_id", filters.task_id);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const timings = (data as TaskTiming[]) || [];

      // Load QA entries for each timing
      if (timings.length > 0) {
        const timingIds = timings.map((t) => t.id);
        const { data: qaEntries, error: qaError } = await client
          .from("timing_qa_entries")
          .select("*, task_qa!inner(qa_name)")
          .in("timing_id", timingIds);

        if (!qaError && qaEntries) {
          const qaByTiming: Record<string, TimingQAEntry[]> = {};
          for (const entry of qaEntries) {
            if (!qaByTiming[entry.timing_id]) {
              qaByTiming[entry.timing_id] = [];
            }
            // Flatten task_qa join into qa_name
            const flatEntry = {
              ...entry,
              qa_name:
                (entry as { task_qa?: { qa_name: string } }).task_qa?.qa_name ||
                "",
            };
            delete (flatEntry as { task_qa?: unknown }).task_qa;
            qaByTiming[entry.timing_id].push(flatEntry as TimingQAEntry);
          }
          for (const timing of timings) {
            timing.qa_entries = qaByTiming[timing.id] || [];
            // Sort by qa_name for consistency
            timing.qa_entries.sort((a, b) =>
              a.qa_name.localeCompare(b.qa_name),
            );
          }
        }
      }

      return timings;
    } catch (error) {
      console.error("Error in getTimings:", error);
      throw error;
    }
  },

  // Obtener un timing por ID (incluye QA entries)
  async getTimingById(id: string, token?: string) {
    try {
      const client = await getClient(token);

      const { data, error } = await client
        .from(TIMINGS_VIEW)
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      const timing = data as TaskTiming;

      // Load QA entries
      const { data: qaEntries, error: qaError } = await client
        .from("timing_qa_entries")
        .select("*, task_qa!inner(qa_name)")
        .eq("timing_id", id);

      if (!qaError && qaEntries) {
        timing.qa_entries = qaEntries.map((entry) => {
          // Flatten task_qa join into qa_name
          const flatEntry = {
            ...entry,
            qa_name:
              (entry as { task_qa?: { qa_name: string } }).task_qa?.qa_name ||
              "",
          };
          delete (flatEntry as { task_qa?: unknown }).task_qa;
          return flatEntry as TimingQAEntry;
        });
        // Sort by qa_name for consistency
        timing.qa_entries.sort((a, b) => a.qa_name.localeCompare(b.qa_name));
      }

      return timing;
    } catch (error) {
      console.error("Error in getTimingById:", error);
      throw error;
    }
  },

  // Crear un nuevo timing con QA entries
  // Parent only stores structural data; hours live in timing_qa_entries
  async createTiming(input: CreateTaskTimingInput, token?: string) {
    try {
      if (!input.user_id) throw new Error("User ID is required");
      if (!input.qa_entries || input.qa_entries.length === 0) {
        throw new Error("At least one QA entry is required");
      }

      const client = await getClient(token);

      // Insert parent (no hour columns — VIEW provides them)
      const { data, error } = await client
        .from("task_timings")
        .insert({
          task_id: input.task_id,
          month: input.month,
          year: input.year,
          user_id: input.user_id,
        })
        .select("id")
        .single();

      if (error) throw error;

      const parentId = data.id;

      // Bulk upsert task_qa rows (2N+1 → 3 queries fijas)
      const { data: taskQAs, error: tqaErr } = await client
        .from("task_qa")
        .upsert(
          input.qa_entries.map((e) => ({
            task_id: input.task_id,
            qa_name: e.qa_name,
          })),
          { onConflict: "task_id,qa_name" },
        )
        .select("id, qa_name");

      if (tqaErr) {
        await client.from("task_timings").delete().eq("id", parentId);
        throw new Error(`Error upserting task_qa: ${tqaErr.message}`);
      }

      const idByName = new Map(
        (taskQAs as { id: string; qa_name: string }[]).map((t) => [
          t.qa_name,
          t.id,
        ]),
      );

      const qaInserts = input.qa_entries.map((entry) => ({
        timing_id: parentId,
        task_qa_id: idByName.get(entry.qa_name)!,
        effective_testing_hours: Math.max(0, entry.effective_testing_hours),
        waiting_environment_hours: Math.max(0, entry.waiting_environment_hours),
        waiting_development_fixes_hours: Math.max(
          0,
          entry.waiting_development_fixes_hours,
        ),
        retest_hours: Math.max(0, entry.retest_hours),
        clarification_hours: Math.max(0, entry.clarification_hours),
      }));

      const { error: qaError } = await client
        .from("timing_qa_entries")
        .insert(qaInserts);

      if (qaError) {
        await client.from("task_timings").delete().eq("id", parentId);
        throw new Error(`Error creating QA entries: ${qaError.message}`);
      }

      // Sincronizar assigned_qa después de crear
      await syncAssignedQA(client, input.task_id);

      // Read back from VIEW to get computed totals
      const created = await this.getTimingById(parentId, token);
      return created;
    } catch (error) {
      console.error("Error in createTiming:", error);
      throw error;
    }
  },

  // Actualizar un timing reemplazando sus QA entries
  async updateTiming(id: string, input: UpdateTaskTimingInput, token?: string) {
    try {
      if (!input.qa_entries || input.qa_entries.length === 0) {
        throw new Error("At least one QA entry is required");
      }

      const client = await getClient(token);

      // Get task_id from timing to resolve task_qa_id
      const { data: timingData, error: timingError } = await client
        .from("task_timings")
        .select("task_id")
        .eq("id", id)
        .single();

      if (timingError || !timingData) throw new Error("Timing not found");

      // Touch updated_at on parent
      const { error: touchError } = await client
        .from("task_timings")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      if (touchError) throw touchError;

      // Replace all QA entries: delete old, insert new
      await client.from("timing_qa_entries").delete().eq("timing_id", id);

      // Bulk upsert task_qa rows (2N+1 → 3 queries fijas)
      const { data: taskQAsUpdate, error: tqaUpdateErr } = await client
        .from("task_qa")
        .upsert(
          input.qa_entries.map((e) => ({
            task_id: timingData.task_id,
            qa_name: e.qa_name,
          })),
          { onConflict: "task_id,qa_name" },
        )
        .select("id, qa_name");

      if (tqaUpdateErr)
        throw new Error(`Error upserting task_qa: ${tqaUpdateErr.message}`);

      const idByNameUpdate = new Map(
        (taskQAsUpdate as { id: string; qa_name: string }[]).map((t) => [
          t.qa_name,
          t.id,
        ]),
      );

      const qaInsertsUpdate = input.qa_entries.map((entry) => ({
        timing_id: id,
        task_qa_id: idByNameUpdate.get(entry.qa_name)!,
        effective_testing_hours: Math.max(0, entry.effective_testing_hours),
        waiting_environment_hours: Math.max(0, entry.waiting_environment_hours),
        waiting_development_fixes_hours: Math.max(
          0,
          entry.waiting_development_fixes_hours,
        ),
        retest_hours: Math.max(0, entry.retest_hours),
        clarification_hours: Math.max(0, entry.clarification_hours),
      }));

      const { error: qaError } = await client
        .from("timing_qa_entries")
        .insert(qaInsertsUpdate);

      if (qaError)
        throw new Error(`Error updating QA entries: ${qaError.message}`);

      // Sincronizar assigned_qa después de actualizar
      await syncAssignedQA(client, timingData.task_id);

      // Read back from VIEW to get computed totals
      return await this.getTimingById(id, token);
    } catch (error) {
      console.error("Error in updateTiming:", error);
      throw error;
    }
  },

  // Eliminar un timing (cascade deletes QA entries)
  async deleteTiming(id: string, token?: string) {
    try {
      const client = await getClient(token);

      // Get task_id before deleting
      const { data: timingData, error: timingError } = await client
        .from("task_timings")
        .select("task_id")
        .eq("id", id)
        .single();

      if (timingError || !timingData) throw new Error("Timing not found");

      const { error } = await client.from("task_timings").delete().eq("id", id);

      if (error) throw error;

      // Sincronizar assigned_qa después de eliminar
      await syncAssignedQA(client, timingData.task_id);

      return { success: true };
    } catch (error) {
      console.error("Error in deleteTiming:", error);
      throw error;
    }
  },

  // Obtener métricas de tiempos por product_type (reads from VIEW)
  async getSquadTimingMetrics(
    filters: {
      month?: number;
      year?: number;
      startDate?: string;
      endDate?: string;
      product_type?: string;
    },
    token?: string,
  ) {
    try {
      const client = await getClient(token);

      // Read from VIEW which already has aggregated hours
      let metricsQuery = client
        .from(TIMINGS_VIEW)
        .select(
          "id, task_id, month, year, effective_testing_hours, waiting_environment_hours, waiting_development_fixes_hours, retest_hours, clarification_hours, total_hours, created_at",
        );

      // When date range is provided, filter by effort_score_date on tasks table
      if (filters.startDate && filters.endDate) {
        const taskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          {
            product_type: filters.product_type,
          },
        );
        if (!taskIds || taskIds.length === 0) return [];
        metricsQuery = metricsQuery.in("task_id", taskIds);
      } else {
        metricsQuery = buildDateRangeFilter(metricsQuery, filters);
      }

      const { data: timingsData, error: timingsError } = await metricsQuery;

      if (timingsError) throw timingsError;

      if (!timingsData || timingsData.length === 0) {
        return [];
      }

      // Get task product_type mapping
      const taskIds = [
        ...new Set(timingsData.map((t: TimingViewRow) => t.task_id)),
      ];

      const { data: tasksData } = await client
        .from("tasks")
        .select("id, product_type")
        .in("id", taskIds);

      const taskProductTypeMap = (tasksData || []).reduce(
        (acc: Record<string, string>, task: TaskProductRow) => {
          acc[task.id] = task.product_type;
          return acc;
        },
        {},
      );

      // Group timings by product_type
      const timingsByProductType = (timingsData as TimingViewRow[]).reduce(
        (acc, timing) => {
          const productType = taskProductTypeMap[timing.task_id] || "Unknown";

          if (filters.product_type && productType !== filters.product_type) {
            return acc;
          }

          if (!acc[productType]) {
            acc[productType] = {
              product_type: productType,
              timings: [],
            };
          }
          acc[productType].timings.push(timing);
          return acc;
        },
        {} as Record<
          string,
          { product_type: string; timings: TimingViewRow[] }
        >,
      );

      // Calculate aggregations
      const metrics: SquadTimingMetrics[] = Object.values(
        timingsByProductType,
      ).map(
        (productData: { product_type: string; timings: TimingViewRow[] }) => {
          const { product_type, timings } = productData;
          const total_effective_testing_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.effective_testing_hours) || 0),
            0,
          );
          const total_waiting_environment_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.waiting_environment_hours) || 0),
            0,
          );
          const total_waiting_development_fixes_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.waiting_development_fixes_hours) || 0),
            0,
          );
          const total_retest_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.retest_hours) || 0),
            0,
          );
          const total_clarification_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.clarification_hours) || 0),
            0,
          );
          const total_hours = timings.reduce(
            (sum: number, t: TimingViewRow) =>
              sum + (parseFloat(t.total_hours) || 0),
            0,
          );
          const task_count = timings.length;

          return {
            product_type,
            total_effective_testing_hours:
              Math.round(total_effective_testing_hours * 100) / 100,
            total_waiting_environment_hours:
              Math.round(total_waiting_environment_hours * 100) / 100,
            total_waiting_development_fixes_hours:
              Math.round(total_waiting_development_fixes_hours * 100) / 100,
            total_retest_hours: Math.round(total_retest_hours * 100) / 100,
            total_clarification_hours:
              Math.round(total_clarification_hours * 100) / 100,
            total_hours: Math.round(total_hours * 100) / 100,
            avg_effective_testing_hours:
              Math.round((total_effective_testing_hours / task_count) * 100) /
              100,
            avg_waiting_environment_hours:
              Math.round((total_waiting_environment_hours / task_count) * 100) /
              100,
            avg_waiting_development_fixes_hours:
              Math.round(
                (total_waiting_development_fixes_hours / task_count) * 100,
              ) / 100,
            avg_retest_hours:
              Math.round((total_retest_hours / task_count) * 100) / 100,
            avg_clarification_hours:
              Math.round((total_clarification_hours / task_count) * 100) / 100,
            avg_total_hours: Math.round((total_hours / task_count) * 100) / 100,
            task_count,
          };
        },
      );

      return metrics;
    } catch (error) {
      console.error("Error in getSquadTimingMetrics:", error);
      throw error;
    }
  },

  // Obtener tiempos por tarea con información de tareas (reads from VIEW)
  async getTaskTimingsWithTaskInfo(filters: {
    month?: number;
    year?: number;
    product_type?: string;
  }) {
    try {
      // For this method we need the VIEW data + task info
      // Since PostgREST views can't use foreign key joins, do separate queries
      let query = supabase.from(TIMINGS_VIEW).select("*");

      if (filters.month !== undefined) {
        query = query.eq("month", filters.month);
      }
      if (filters.year !== undefined) {
        query = query.eq("year", filters.year);
      }

      const { data: timingsData, error: timingsError } = await query.order(
        "created_at",
        {
          ascending: false,
        },
      );

      if (timingsError) throw timingsError;
      if (!timingsData || timingsData.length === 0) return [];

      // Get task info for these timings
      const taskIds = [
        ...new Set(timingsData.map((t: TimingViewRow) => t.task_id)),
      ];
      let tasksQuery = supabase
        .from("tasks")
        .select("id, name, task_link, status, product_type, created_at")
        .in("id", taskIds);

      if (filters.product_type) {
        tasksQuery = tasksQuery.eq("product_type", filters.product_type);
      }

      const { data: tasksData } = await tasksQuery;
      const tasksMap = (tasksData || []).reduce(
        (acc: Record<string, TaskInfoRow>, task: TaskInfoRow) => {
          acc[task.id] = task;
          return acc;
        },
        {},
      );

      // Combine and filter
      return timingsData
        .filter((t: TimingViewRow) => tasksMap[t.task_id])
        .map((t: TimingViewRow) => ({ ...t, tasks: tasksMap[t.task_id] }));
    } catch (error) {
      console.error("Error in getTaskTimingsWithTaskInfo:", error);
      throw error;
    }
  },

  // Obtener métricas de tiempos agrupadas por QA
  async getQATimingMetrics(
    filters: {
      month?: number;
      year?: number;
      startDate?: string;
      endDate?: string;
      product_type?: string;
    },
    token?: string,
  ): Promise<QATimingMetrics[]> {
    try {
      const client = await getClient(token);

      // Get all task_timings IDs for the date range
      let qaTimingsQuery = client.from("task_timings").select("id, task_id");

      // When date range is provided, filter by effort_score_date on tasks table
      if (filters.startDate && filters.endDate) {
        const effortTaskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          {
            product_type: filters.product_type,
          },
        );
        if (!effortTaskIds || effortTaskIds.length === 0) return [];
        qaTimingsQuery = qaTimingsQuery.in("task_id", effortTaskIds);
      } else {
        qaTimingsQuery = buildDateRangeFilter(qaTimingsQuery, filters);
      }

      const { data: timingsData, error: timingsError } = await qaTimingsQuery;

      if (timingsError) throw timingsError;
      if (!timingsData || timingsData.length === 0) return [];

      // If product_type filter (only when no date range — already filtered above)
      let filteredTimingIds = timingsData.map(
        (t: { id: string; task_id: string }) => t.id,
      );
      if (filters.product_type && !(filters.startDate && filters.endDate)) {
        const taskIds = [
          ...new Set(
            timingsData.map((t: { id: string; task_id: string }) => t.task_id),
          ),
        ];
        const { data: tasksData } = await client
          .from("tasks")
          .select("id, product_type")
          .in("id", taskIds)
          .eq("product_type", filters.product_type);

        const matchingTaskIds = new Set(
          (tasksData || []).map((t: TaskIdRow) => t.id),
        );
        filteredTimingIds = timingsData
          .filter((t: { id: string; task_id: string }) =>
            matchingTaskIds.has(t.task_id),
          )
          .map((t: { id: string; task_id: string }) => t.id);

        if (filteredTimingIds.length === 0) return [];
      }

      // Get all QA entries for these timings
      const { data: qaEntries, error: qaError } = await client
        .from("timing_qa_entries")
        .select("*, task_qa!inner(qa_name)")
        .in("timing_id", filteredTimingIds);

      if (qaError) throw qaError;
      if (!qaEntries || qaEntries.length === 0) return [];

      // Flatten task_qa join and group by qa_name
      const byQA: Record<string, TimingQAEntry[]> = {};
      for (const entry of qaEntries) {
        const qaName =
          (entry as { task_qa?: { qa_name: string } }).task_qa?.qa_name || "";
        const flatEntry = {
          ...entry,
          qa_name: qaName,
        };
        delete (flatEntry as { task_qa?: unknown }).task_qa;
        if (!byQA[qaName]) byQA[qaName] = [];
        byQA[qaName].push(flatEntry as TimingQAEntry);
      }

      // Calculate metrics per QA
      const metrics: QATimingMetrics[] = Object.entries(byQA).map(
        ([qaName, entries]) => {
          const totals = {
            effective_testing_hours: 0,
            waiting_environment_hours: 0,
            waiting_development_fixes_hours: 0,
            retest_hours: 0,
            clarification_hours: 0,
            total_hours: 0,
          };

          for (const e of entries) {
            totals.effective_testing_hours +=
              Number(e.effective_testing_hours) || 0;
            totals.waiting_environment_hours +=
              Number(e.waiting_environment_hours) || 0;
            totals.waiting_development_fixes_hours +=
              Number(e.waiting_development_fixes_hours) || 0;
            totals.retest_hours += Number(e.retest_hours) || 0;
            totals.clarification_hours += Number(e.clarification_hours) || 0;
            totals.total_hours += Number(e.total_hours) || 0;
          }

          const count = entries.length;
          const efficiencyRate =
            totals.total_hours > 0
              ? (totals.effective_testing_hours / totals.total_hours) * 100
              : 0;
          const retestRate =
            totals.effective_testing_hours > 0
              ? (totals.retest_hours / totals.effective_testing_hours) * 100
              : 0;

          return {
            qa_name: qaName,
            total_effective_testing_hours:
              Math.round(totals.effective_testing_hours * 100) / 100,
            total_waiting_environment_hours:
              Math.round(totals.waiting_environment_hours * 100) / 100,
            total_waiting_development_fixes_hours:
              Math.round(totals.waiting_development_fixes_hours * 100) / 100,
            total_retest_hours: Math.round(totals.retest_hours * 100) / 100,
            total_clarification_hours:
              Math.round(totals.clarification_hours * 100) / 100,
            total_hours: Math.round(totals.total_hours * 100) / 100,
            avg_effective_testing_hours:
              Math.round((totals.effective_testing_hours / count) * 100) / 100,
            avg_waiting_environment_hours:
              Math.round((totals.waiting_environment_hours / count) * 100) /
              100,
            avg_waiting_development_fixes_hours:
              Math.round(
                (totals.waiting_development_fixes_hours / count) * 100,
              ) / 100,
            avg_retest_hours:
              Math.round((totals.retest_hours / count) * 100) / 100,
            avg_clarification_hours:
              Math.round((totals.clarification_hours / count) * 100) / 100,
            avg_total_hours:
              Math.round((totals.total_hours / count) * 100) / 100,
            task_count: count,
            efficiency_rate: Math.round(efficiencyRate * 100) / 100,
            retest_rate: Math.round(retestRate * 100) / 100,
          };
        },
      );

      // Sort by total hours descending
      return metrics.sort((a, b) => b.total_hours - a.total_hours);
    } catch (error) {
      console.error("Error in getQATimingMetrics:", error);
      throw error;
    }
  },
};
