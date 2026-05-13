import { supabase } from "@/lib/supabase";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  TaskTiming,
  CreateTaskTimingInput,
  UpdateTaskTimingInput,
  SquadTimingMetrics,
  QATimingMetrics,
  TimingQAEntry,
  CatalogTimingCategory,
} from "@/lib/types";

// Row shapes
interface TimingParentRow {
  id: string;
  task_id: string;
  month: number;
  year: number;
  user_id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface QAEntryRow {
  id: string;
  timing_id: string;
  task_qa_id: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface CategoryHourRow {
  id: string;
  timing_qa_entry_id: string;
  category_id: string;
  hours: number;
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

async function getTimingCategories(
  client: SupabaseClient,
): Promise<CatalogTimingCategory[]> {
  const { data, error } = await client
    .from("timing_categories")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) {
    console.error("Failed to fetch timing_categories:", error);
    throw error;
  }
  return (data as CatalogTimingCategory[]) ?? [];
}

function buildSlugToIdMap(
  cats: CatalogTimingCategory[],
): Record<string, string> {
  return Object.fromEntries(cats.map((c) => [c.slug, c.id]));
}

function sumHoursBy(hbc: Record<string, number>): number {
  return Object.values(hbc).reduce((acc, h) => acc + (h || 0), 0);
}

function flattenQAEntries(
  qaEntryRows: QAEntryRow[],
  categoryHourRows: CategoryHourRow[],
): TimingQAEntry[] {
  const hoursByEntry: Record<string, Record<string, number>> = {};
  for (const ch of categoryHourRows) {
    if (!hoursByEntry[ch.timing_qa_entry_id])
      hoursByEntry[ch.timing_qa_entry_id] = {};
    hoursByEntry[ch.timing_qa_entry_id][ch.category_id] = ch.hours;
  }
  return qaEntryRows.map((entry) => {
    const hours_by_category = hoursByEntry[entry.id] ?? {};
    const total_hours = sumHoursBy(hours_by_category);
    const rawQA = entry["task_qa"];
    const qa_name =
      (Array.isArray(rawQA)
        ? (rawQA[0] as { qa_name?: string })?.qa_name
        : (rawQA as { qa_name?: string } | undefined)?.qa_name) ?? "";
    return {
      id: entry.id as string,
      timing_id: entry.timing_id as string,
      task_qa_id: entry.task_qa_id as string,
      qa_name,
      hours_by_category,
      total_hours,
      created_at: entry.created_at as string,
      updated_at: entry.updated_at as string,
    };
  });
}

function buildDateRangeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: {
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  },
) {
  if (
    filters.month !== undefined &&
    filters.year !== undefined &&
    !filters.startDate
  ) {
    return query.eq("month", filters.month).eq("year", filters.year);
  }
  if (filters.startDate && filters.endDate) {
    const parseISO = (s: string) => {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) throw new Error(`Invalid date: ${s}`);
      return { year: +m[1], month: +m[2] };
    };
    const s = parseISO(filters.startDate);
    const e = parseISO(filters.endDate);
    if (s.year === e.year && s.month === e.month)
      return query.eq("year", s.year).eq("month", s.month);
    if (s.year === e.year)
      return query
        .eq("year", s.year)
        .gte("month", s.month)
        .lte("month", e.month);
    const conds: string[] = [];
    for (let y = s.year; y <= e.year; y++) {
      const mn = y === s.year ? s.month : 1;
      const mx = y === e.year ? e.month : 12;
      conds.push(
        mn === mx
          ? `and(year.eq.${y},month.eq.${mn})`
          : `and(year.eq.${y},month.gte.${mn},month.lte.${mx})`,
      );
    }
    return query.or(conds.join(","));
  }
  if (filters.month !== undefined) query = query.eq("month", filters.month);
  if (filters.year !== undefined) query = query.eq("year", filters.year);
  return query;
}

async function getTaskIdsByEffortDate(
  client: SupabaseClient,
  startDate: string,
  endDate: string,
  extraFilters?: { product_type?: string },
): Promise<string[]> {
  let q = client
    .from("tasks")
    .select("id")
    .gte("effort_score_date", startDate)
    .lte("effort_score_date", endDate);
  if (extraFilters?.product_type)
    q = q.eq("product_type", extraFilters.product_type);
  const { data, error } = await q;
  if (error) throw error;
  return data ? (data as TaskIdRow[]).map((t) => t.id) : [];
}

export const timingService = {
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
      let query = client.from("task_timings").select("*");

      if (filters.startDate && filters.endDate) {
        const taskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          { product_type: filters.product_type },
        );
        if (taskIds.length === 0) return [];
        query = query.in("task_id", taskIds);
      } else {
        query = buildDateRangeFilter(query, filters);
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

      if (filters.task_id) query = query.eq("task_id", filters.task_id);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const parentRows = (data as TimingParentRow[]) || [];
      if (parentRows.length === 0) return [];

      const timingIds = parentRows.map((t) => t.id);
      const { data: qaEntryRows, error: qaError } = await client
        .from("timing_qa_entries")
        .select(
          "id, timing_id, task_qa_id, created_at, updated_at, task_qa!inner(qa_name)",
        )
        .in("timing_id", timingIds);

      let categoryHoursData: CategoryHourRow[] = [];
      if (!qaError && qaEntryRows && qaEntryRows.length > 0) {
        const entryIds = (qaEntryRows as QAEntryRow[]).map((e) => e.id);
        const { data: ch, error: categoryHoursError } = await client
          .from("timing_qa_category_hours")
          .select("id, timing_qa_entry_id, category_id, hours")
          .in("timing_qa_entry_id", entryIds);
        if (categoryHoursError) throw categoryHoursError;
        categoryHoursData = (ch as CategoryHourRow[]) ?? [];
      }

      const flatEntries =
        !qaError && qaEntryRows
          ? flattenQAEntries(qaEntryRows as QAEntryRow[], categoryHoursData)
          : [];
      const qaByTiming: Record<string, TimingQAEntry[]> = {};
      for (const entry of flatEntries) {
        if (!qaByTiming[entry.timing_id]) qaByTiming[entry.timing_id] = [];
        qaByTiming[entry.timing_id].push(entry);
      }

      return parentRows.map((row) => {
        const entries = (qaByTiming[row.id] ?? []).sort((a, b) =>
          a.qa_name.localeCompare(b.qa_name),
        );
        return {
          id: row.id,
          task_id: row.task_id,
          month: row.month,
          year: row.year,
          user_id: row.user_id,
          total_hours: entries.reduce((s, e) => s + e.total_hours, 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
          qa_entries: entries,
        };
      }) as TaskTiming[];
    } catch (error) {
      console.error("Error in getTimings:", error);
      throw error;
    }
  },

  async getTimingById(id: string, token?: string) {
    try {
      const client = await getClient(token);
      const { data, error } = await client
        .from("task_timings")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      const row = data as TimingParentRow;

      const { data: qaEntryRows, error: qaError } = await client
        .from("timing_qa_entries")
        .select(
          "id, timing_id, task_qa_id, created_at, updated_at, task_qa!inner(qa_name)",
        )
        .eq("timing_id", id);

      let qa_entries: TimingQAEntry[] = [];
      if (!qaError && qaEntryRows && qaEntryRows.length > 0) {
        const entryIds = (qaEntryRows as QAEntryRow[]).map((e) => e.id);
        const { data: catHours, error: catHoursError } = await client
          .from("timing_qa_category_hours")
          .select("id, timing_qa_entry_id, category_id, hours")
          .in("timing_qa_entry_id", entryIds);
        if (catHoursError) throw catHoursError;
        qa_entries = flattenQAEntries(
          qaEntryRows as QAEntryRow[],
          (catHours as CategoryHourRow[]) ?? [],
        ).sort((a, b) => a.qa_name.localeCompare(b.qa_name));
      }

      return {
        id: row.id,
        task_id: row.task_id,
        month: row.month,
        year: row.year,
        user_id: row.user_id,
        total_hours: qa_entries.reduce((s, e) => s + e.total_hours, 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        qa_entries,
      } as TaskTiming;
    } catch (error) {
      console.error("Error in getTimingById:", error);
      throw error;
    }
  },

  async createTiming(input: CreateTaskTimingInput, token?: string) {
    try {
      if (!input.user_id) throw new Error("User ID is required");
      if (!input.qa_entries || input.qa_entries.length === 0)
        throw new Error("At least one QA entry is required");

      const client = await getClient(token);
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
      const { data: insertedEntries, error: qaInsertError } = await client
        .from("timing_qa_entries")
        .insert(
          input.qa_entries.map((e) => ({
            timing_id: parentId,
            task_qa_id: idByName.get(e.qa_name)!,
          })),
        )
        .select("id, task_qa_id");
      if (qaInsertError) {
        await client.from("task_timings").delete().eq("id", parentId);
        throw new Error(`Error creating QA entries: ${qaInsertError.message}`);
      }

      const entryIdByQaId = new Map(
        (insertedEntries as { id: string; task_qa_id: string }[]).map((e) => [
          e.task_qa_id,
          e.id,
        ]),
      );
      const categoryHourInserts: {
        timing_qa_entry_id: string;
        category_id: string;
        hours: number;
      }[] = [];
      for (const entry of input.qa_entries) {
        const qaId = idByName.get(entry.qa_name);
        const entryId = qaId ? entryIdByQaId.get(qaId) : undefined;
        if (!entryId) continue;
        for (const [categoryId, hours] of Object.entries(
          entry.hours_by_category,
        )) {
          if (hours > 0)
            categoryHourInserts.push({
              timing_qa_entry_id: entryId,
              category_id: categoryId,
              hours,
            });
        }
      }
      if (categoryHourInserts.length > 0) {
        const { error: chError } = await client
          .from("timing_qa_category_hours")
          .insert(categoryHourInserts);
        if (chError) {
          await client.from("task_timings").delete().eq("id", parentId);
          throw new Error(`Error creating category hours: ${chError.message}`);
        }
      }

      return await this.getTimingById(parentId, token);
    } catch (error) {
      console.error("Error in createTiming:", error);
      throw error;
    }
  },

  async updateTiming(id: string, input: UpdateTaskTimingInput, token?: string) {
    try {
      if (!input.qa_entries || input.qa_entries.length === 0)
        throw new Error("At least one QA entry is required");

      const client = await getClient(token);
      const { data: timingData, error: timingError } = await client
        .from("task_timings")
        .select("task_id")
        .eq("id", id)
        .single();
      if (timingError || !timingData) throw new Error("Timing not found");

      const { error: touchError } = await client
        .from("task_timings")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
      if (touchError) throw touchError;

      // Guardar entries existentes (+ sus horas por categoría) antes de borrar
      // Si esta lectura falla, abortamos para no dejar el timing sin posibilidad de rollback
      type ExistingEntry = { id: string; task_qa_id: string };
      type ExistingCatHour = {
        id: string;
        timing_qa_entry_id: string;
        category_id: string;
        hours: number;
      };
      const { data: existingEntries, error: existingEntriesError } =
        await client
          .from("timing_qa_entries")
          .select("id, task_qa_id")
          .eq("timing_id", id);
      if (existingEntriesError)
        throw new Error(
          `Error reading existing QA entries: ${existingEntriesError.message}`,
        );

      const savedEntries: ExistingEntry[] =
        (existingEntries as ExistingEntry[] | null) ?? [];
      let savedCategoryHours: ExistingCatHour[] = [];
      if (savedEntries.length > 0) {
        const savedEntryIds = savedEntries.map((e) => e.id);
        const { data: savedCh, error: savedChError } = await client
          .from("timing_qa_category_hours")
          .select("id, timing_qa_entry_id, category_id, hours")
          .in("timing_qa_entry_id", savedEntryIds);
        if (savedChError)
          throw new Error(
            `Error reading existing category hours: ${savedChError.message}`,
          );
        savedCategoryHours = (savedCh as ExistingCatHour[] | null) ?? [];
      }

      const { error: deleteQaEntriesError } = await client
        .from("timing_qa_entries")
        .delete()
        .eq("timing_id", id);
      if (deleteQaEntriesError)
        throw new Error(
          `Error deleting QA entries: ${deleteQaEntriesError.message}`,
        );

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
      const { data: updatedEntries, error: qaInsertErr } = await client
        .from("timing_qa_entries")
        .insert(
          input.qa_entries.map((e) => ({
            timing_id: id,
            task_qa_id: idByNameUpdate.get(e.qa_name)!,
          })),
        )
        .select("id, task_qa_id");
      if (qaInsertErr) {
        // Compensación: restaurar entries anteriores + sus horas por categoría
        if (savedEntries.length > 0) {
          await client.from("timing_qa_entries").insert(
            savedEntries.map((e) => ({
              id: e.id,
              timing_id: id,
              task_qa_id: e.task_qa_id,
            })),
          );
          if (savedCategoryHours.length > 0) {
            await client.from("timing_qa_category_hours").insert(
              savedCategoryHours.map((ch) => ({
                id: ch.id,
                timing_qa_entry_id: ch.timing_qa_entry_id,
                category_id: ch.category_id,
                hours: ch.hours,
              })),
            );
          }
        }
        throw new Error(`Error updating QA entries: ${qaInsertErr.message}`);
      }

      const entryIdByQaIdUpdate = new Map(
        (updatedEntries as { id: string; task_qa_id: string }[]).map((e) => [
          e.task_qa_id,
          e.id,
        ]),
      );
      const categoryHourUpdates: {
        timing_qa_entry_id: string;
        category_id: string;
        hours: number;
      }[] = [];
      for (const entry of input.qa_entries) {
        const qaId = idByNameUpdate.get(entry.qa_name);
        const entryId = qaId ? entryIdByQaIdUpdate.get(qaId) : undefined;
        if (!entryId) continue;
        for (const [categoryId, hours] of Object.entries(
          entry.hours_by_category,
        )) {
          if (hours > 0)
            categoryHourUpdates.push({
              timing_qa_entry_id: entryId,
              category_id: categoryId,
              hours,
            });
        }
      }
      if (categoryHourUpdates.length > 0) {
        const { error: chErr } = await client
          .from("timing_qa_category_hours")
          .insert(categoryHourUpdates);
        if (chErr) {
          // Compensación: eliminar las nuevas entries y restaurar las anteriores con sus horas
          const newEntryIds = (
            updatedEntries as { id: string; task_qa_id: string }[]
          ).map((e) => e.id);
          if (newEntryIds.length > 0) {
            await client
              .from("timing_qa_entries")
              .delete()
              .in("id", newEntryIds);
          }
          if (savedEntries.length > 0) {
            await client.from("timing_qa_entries").insert(
              savedEntries.map((e) => ({
                id: e.id,
                timing_id: id,
                task_qa_id: e.task_qa_id,
              })),
            );
            if (savedCategoryHours.length > 0) {
              await client.from("timing_qa_category_hours").insert(
                savedCategoryHours.map((ch) => ({
                  id: ch.id,
                  timing_qa_entry_id: ch.timing_qa_entry_id,
                  category_id: ch.category_id,
                  hours: ch.hours,
                })),
              );
            }
          }
          throw new Error(`Error updating category hours: ${chErr.message}`);
        }
      }

      return await this.getTimingById(id, token);
    } catch (error) {
      console.error("Error in updateTiming:", error);
      throw error;
    }
  },

  async deleteTiming(id: string, token?: string) {
    try {
      const client = await getClient(token);
      const { data: timingData, error: timingError } = await client
        .from("task_timings")
        .select("task_id")
        .eq("id", id)
        .single();
      if (timingError || !timingData) throw new Error("Timing not found");
      const { error } = await client.from("task_timings").delete().eq("id", id);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Error in deleteTiming:", error);
      throw error;
    }
  },

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
      const categories = await getTimingCategories(client);
      const catIds = categories.map((c) => c.id);

      let timingsQuery = client.from("task_timings").select("id, task_id");
      if (filters.startDate && filters.endDate) {
        const taskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          { product_type: filters.product_type },
        );
        if (taskIds.length === 0) return [];
        timingsQuery = timingsQuery.in("task_id", taskIds);
      } else {
        timingsQuery = buildDateRangeFilter(timingsQuery, filters);
      }

      const { data: timingsData, error: timingsError } = await timingsQuery;
      if (timingsError) throw timingsError;
      if (!timingsData || timingsData.length === 0) return [];

      const allTaskIds = [
        ...new Set(
          timingsData.map((t: { id: string; task_id: string }) => t.task_id),
        ),
      ];
      const { data: tasksData } = await client
        .from("tasks")
        .select("id, product_type")
        .in("id", allTaskIds);
      const taskProductTypeMap = ((tasksData || []) as TaskProductRow[]).reduce(
        (acc: Record<string, string>, t) => {
          acc[t.id] = t.product_type;
          return acc;
        },
        {},
      );

      let filteredTimings = timingsData as { id: string; task_id: string }[];
      if (filters.product_type && !(filters.startDate && filters.endDate)) {
        filteredTimings = filteredTimings.filter(
          (t) => taskProductTypeMap[t.task_id] === filters.product_type,
        );
        if (filteredTimings.length === 0) return [];
      }

      const timingIds = filteredTimings.map((t) => t.id);
      const { data: qaEntryRows, error: qaErr } = await client
        .from("timing_qa_entries")
        .select(
          "id, timing_id, task_qa_id, created_at, updated_at, task_qa!inner(qa_name)",
        )
        .in("timing_id", timingIds);
      if (qaErr) throw qaErr;

      let categoryHoursData: CategoryHourRow[] = [];
      if (qaEntryRows && qaEntryRows.length > 0) {
        const entryIds = (qaEntryRows as QAEntryRow[]).map((e) => e.id);
        const { data: ch, error: chErr } = await client
          .from("timing_qa_category_hours")
          .select("id, timing_qa_entry_id, category_id, hours")
          .in("timing_qa_entry_id", entryIds);
        if (chErr) throw chErr;
        categoryHoursData = (ch as CategoryHourRow[]) ?? [];
      }

      const initCatTotals = () =>
        catIds.reduce(
          (a, id) => {
            a[id] = 0;
            return a;
          },
          {} as Record<string, number>,
        );
      const entryToTiming: Record<string, string> = {};
      if (qaEntryRows)
        for (const e of qaEntryRows as QAEntryRow[])
          entryToTiming[e.id] = e.timing_id;
      const timingToProduct: Record<string, string> = {};
      for (const t of filteredTimings)
        timingToProduct[t.id] = taskProductTypeMap[t.task_id] || "Unknown";

      const byProductType: Record<
        string,
        { timings: Set<string>; totals_by_category: Record<string, number> }
      > = {};
      for (const ch of categoryHoursData) {
        const timingId = entryToTiming[ch.timing_qa_entry_id];
        if (!timingId) continue;
        const pt = timingToProduct[timingId] || "Unknown";
        if (!byProductType[pt])
          byProductType[pt] = {
            timings: new Set(),
            totals_by_category: initCatTotals(),
          };
        byProductType[pt].timings.add(timingId);
        byProductType[pt].totals_by_category[ch.category_id] =
          (byProductType[pt].totals_by_category[ch.category_id] ?? 0) +
          ch.hours;
      }
      for (const t of filteredTimings) {
        const pt = timingToProduct[t.id] || "Unknown";
        if (!byProductType[pt])
          byProductType[pt] = {
            timings: new Set(),
            totals_by_category: initCatTotals(),
          };
        byProductType[pt].timings.add(t.id);
      }

      return Object.entries(byProductType).map(([product_type, agg]) => {
        const task_count = agg.timings.size;
        const totals_by_category = agg.totals_by_category;
        const total_hours = Object.values(totals_by_category).reduce(
          (s, v) => s + v,
          0,
        );
        const averages_by_category = catIds.reduce(
          (a, id) => {
            a[id] =
              task_count > 0
                ? Math.round(
                    ((totals_by_category[id] ?? 0) / task_count) * 100,
                  ) / 100
                : 0;
            return a;
          },
          {} as Record<string, number>,
        );
        return {
          product_type,
          totals_by_category,
          averages_by_category,
          total_hours: Math.round(total_hours * 100) / 100,
          avg_total_hours:
            task_count > 0
              ? Math.round((total_hours / task_count) * 100) / 100
              : 0,
          task_count,
        };
      }) as SquadTimingMetrics[];
    } catch (error) {
      console.error("Error in getSquadTimingMetrics:", error);
      throw error;
    }
  },

  async getTaskTimingsWithTaskInfo(filters: {
    month?: number;
    year?: number;
    product_type?: string;
  }) {
    try {
      let query = supabase
        .from("task_timings")
        .select("id, task_id, month, year, created_at, updated_at");
      if (filters.month !== undefined) query = query.eq("month", filters.month);
      if (filters.year !== undefined) query = query.eq("year", filters.year);

      const { data: timingsData, error: timingsError } = await query.order(
        "created_at",
        { ascending: false },
      );
      if (timingsError) throw timingsError;
      if (!timingsData || timingsData.length === 0) return [];

      const taskIds = [
        ...new Set(timingsData.map((t: { task_id: string }) => t.task_id)),
      ];
      let tasksQuery = supabase
        .from("tasks")
        .select("id, name, task_link, status, product_type, created_at")
        .in("id", taskIds);
      if (filters.product_type)
        tasksQuery = tasksQuery.eq("product_type", filters.product_type);

      const { data: tasksData } = await tasksQuery;
      const tasksMap = ((tasksData || []) as TaskInfoRow[]).reduce(
        (acc: Record<string, TaskInfoRow>, task) => {
          acc[task.id] = task;
          return acc;
        },
        {},
      );
      return timingsData
        .filter((t: { task_id: string }) => tasksMap[t.task_id])
        .map((t: { task_id: string }) => ({
          ...t,
          tasks: tasksMap[t.task_id],
        }));
    } catch (error) {
      console.error("Error in getTaskTimingsWithTaskInfo:", error);
      throw error;
    }
  },

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
      const categories = await getTimingCategories(client);
      const catIds = categories.map((c) => c.id);
      const slugToId = buildSlugToIdMap(categories);
      const effectiveTestingId = slugToId["effective_testing"];
      const retestId = slugToId["qa_ready_for_testing"];

      let qaTimingsQuery = client.from("task_timings").select("id, task_id");
      if (filters.startDate && filters.endDate) {
        const effortTaskIds = await getTaskIdsByEffortDate(
          client,
          filters.startDate,
          filters.endDate,
          { product_type: filters.product_type },
        );
        if (effortTaskIds.length === 0) return [];
        qaTimingsQuery = qaTimingsQuery.in("task_id", effortTaskIds);
      } else {
        qaTimingsQuery = buildDateRangeFilter(qaTimingsQuery, filters);
      }

      const { data: timingsData, error: timingsError } = await qaTimingsQuery;
      if (timingsError) throw timingsError;
      if (!timingsData || timingsData.length === 0) return [];

      let filteredTimingIds = (
        timingsData as { id: string; task_id: string }[]
      ).map((t) => t.id);
      if (filters.product_type && !(filters.startDate && filters.endDate)) {
        const allTaskIds = [
          ...new Set(
            (timingsData as { id: string; task_id: string }[]).map(
              (t) => t.task_id,
            ),
          ),
        ];
        const { data: tasksData } = await client
          .from("tasks")
          .select("id")
          .in("id", allTaskIds)
          .eq("product_type", filters.product_type);
        const matchingTaskIds = new Set(
          (tasksData || []).map((t: TaskIdRow) => t.id),
        );
        filteredTimingIds = (timingsData as { id: string; task_id: string }[])
          .filter((t) => matchingTaskIds.has(t.task_id))
          .map((t) => t.id);
        if (filteredTimingIds.length === 0) return [];
      }

      const { data: qaEntryRows, error: qaError } = await client
        .from("timing_qa_entries")
        .select(
          "id, timing_id, task_qa_id, created_at, updated_at, task_qa!inner(qa_name)",
        )
        .in("timing_id", filteredTimingIds);
      if (qaError) throw qaError;
      if (!qaEntryRows || qaEntryRows.length === 0) return [];

      const entryIds = (qaEntryRows as QAEntryRow[]).map((e) => e.id);
      const { data: catHours, error: catHoursErr } = await client
        .from("timing_qa_category_hours")
        .select("id, timing_qa_entry_id, category_id, hours")
        .in("timing_qa_entry_id", entryIds);
      if (catHoursErr) throw catHoursErr;
      const flatEntries = flattenQAEntries(
        qaEntryRows as QAEntryRow[],
        (catHours as CategoryHourRow[]) ?? [],
      );

      // Construir mapa timingId -> taskId a partir de timingsData
      const timingToTask = new Map<string, string>(
        (timingsData as { id: string; task_id: string }[]).map((t) => [
          t.id,
          t.task_id,
        ]),
      );

      // Obtener assigned_qa de todas las tareas involucradas
      const involvedTaskIds = [
        ...new Set(timingToTask.values()),
      ];
      const { data: assignedQAData, error: assignedQAError } = await client
        .from("tasks")
        .select("id, assigned_qa")
        .in("id", involvedTaskIds);
      if (assignedQAError) throw assignedQAError;
      const taskAssignedQA = new Map<string, string[]>(
        ((assignedQAData ?? []) as { id: string; assigned_qa: string[] }[]).map(
          (t) => [t.id, Array.isArray(t.assigned_qa) ? t.assigned_qa.filter(Boolean) : []],
        ),
      );

      // Pre-agregación diferenciada:
      // - Tareas CON assigned_qa: colapsar por timing_id (todos los registradores → suma)
      //   para luego redistribuir equitativamente entre los QAs asignados.
      // - Tareas SIN assigned_qa: agregar por (timing_id, qa_name) para preservar
      //   el desglose real por registrador sin perder información.
      const byTimingAssigned = new Map<string, TimingQAEntry>(); // timing_id → aggregate
      const byTimingQA = new Map<string, TimingQAEntry>();        // `${timing_id}|${qa_name}` → aggregate

      for (const entry of flatEntries) {
        const taskId = timingToTask.get(entry.timing_id);
        const assignedQAs = taskId ? (taskAssignedQA.get(taskId) ?? []) : [];

        if (assignedQAs.length > 0) {
          const existing = byTimingAssigned.get(entry.timing_id);
          if (!existing) {
            byTimingAssigned.set(entry.timing_id, {
              ...entry,
              hours_by_category: { ...entry.hours_by_category },
            });
          } else {
            existing.total_hours += entry.total_hours;
            for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
              existing.hours_by_category[catId] =
                (existing.hours_by_category[catId] ?? 0) + hours;
            }
          }
        } else {
          const key = `${entry.timing_id}|${entry.qa_name}`;
          const existing = byTimingQA.get(key);
          if (!existing) {
            byTimingQA.set(key, {
              ...entry,
              hours_by_category: { ...entry.hours_by_category },
            });
          } else {
            existing.total_hours += entry.total_hours;
            for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
              existing.hours_by_category[catId] =
                (existing.hours_by_category[catId] ?? 0) + hours;
            }
          }
        }
      }

      // Redistribuir timings con assigned_qa: 1 entrada por (timing, qaAsignado)
      const byQA: Record<string, TimingQAEntry[]> = {};
      for (const entry of byTimingAssigned.values()) {
        const taskId = timingToTask.get(entry.timing_id);
        const assignedQAs = taskId ? (taskAssignedQA.get(taskId) ?? []) : [];
        const share = 1 / assignedQAs.length;
        for (const qaName of assignedQAs) {
          if (!byQA[qaName]) byQA[qaName] = [];
          byQA[qaName].push({
            ...entry,
            qa_name: qaName,
            total_hours: entry.total_hours * share,
            hours_by_category: Object.fromEntries(
              Object.entries(entry.hours_by_category).map(([k, v]) => [
                k,
                v * share,
              ]),
            ),
          });
        }
      }
      // Timings sin assigned_qa: agregar directamente por registrador
      for (const entry of byTimingQA.values()) {
        const qaName = entry.qa_name;
        if (!byQA[qaName]) byQA[qaName] = [];
        byQA[qaName].push(entry);
      }

      const initTotals = () =>
        catIds.reduce(
          (a, id) => {
            a[id] = 0;
            return a;
          },
          {} as Record<string, number>,
        );

      const metrics: QATimingMetrics[] = Object.entries(byQA).map(
        ([qaName, entries]) => {
          const totals_by_category = initTotals();
          let total_hours = 0;
          const uniqueTaskIds = new Set<string>();
          for (const e of entries) {
            for (const [catId, hours] of Object.entries(e.hours_by_category)) {
              totals_by_category[catId] =
                (totals_by_category[catId] ?? 0) + hours;
            }
            total_hours += e.total_hours;
            const taskId = timingToTask.get(e.timing_id);
            if (taskId) uniqueTaskIds.add(taskId);
          }
          const count = uniqueTaskIds.size || entries.length;
          const averages_by_category = catIds.reduce(
            (a, id) => {
              a[id] =
                count > 0
                  ? Math.round(((totals_by_category[id] ?? 0) / count) * 100) /
                    100
                  : 0;
              return a;
            },
            {} as Record<string, number>,
          );
          const effectiveTesting = effectiveTestingId
            ? (totals_by_category[effectiveTestingId] ?? 0)
            : 0;
          const retest = retestId ? (totals_by_category[retestId] ?? 0) : 0;
          return {
            qa_name: qaName,
            totals_by_category,
            averages_by_category,
            total_hours: Math.round(total_hours * 100) / 100,
            avg_total_hours:
              count > 0 ? Math.round((total_hours / count) * 100) / 100 : 0,
            task_count: count,
            efficiency_rate:
              Math.round(
                (total_hours > 0 ? (effectiveTesting / total_hours) * 100 : 0) *
                  100,
              ) / 100,
            retest_rate:
              Math.round(
                (effectiveTesting > 0 ? (retest / effectiveTesting) * 100 : 0) *
                  100,
              ) / 100,
          };
        },
      );

      return metrics.sort((a, b) => b.total_hours - a.total_hours);
    } catch (error) {
      console.error("Error in getQATimingMetrics:", error);
      throw error;
    }
  },
};
