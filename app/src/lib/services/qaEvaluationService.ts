import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { QAEvaluationRow, UpsertQAEvaluationInput } from "@/lib/types";

interface QAMemberRow {
  id: string;
  name: string;
}

interface TasaRow {
  qa_name: string;
  count: number;
}

interface CompletedTaskRow {
  task_id: string;
  tshirt_size: string;
  status: string;
  task_qa_id: string;
  qa_name: string;
}

interface HoursRow {
  task_qa_id: string;
  total_hours: number;
}

interface ComplexityRow {
  name: string;
  min_hours: number;
  max_hours: number;
}

interface EvaluationRow {
  id: string;
  qa_id: string;
  start_date: string;
  end_date: string;
  excelencia: number | null;
  soft_skills: number | null;
  comentarios: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Valores guardados explícitamente (períodos históricos cerrados).
  // Si son null, el servicio los calcula en tiempo real.
  tasa_aceptacion: number | null;
  cumplimiento: number | null;
}

/**
 * Lista todos los QAs activos con métricas calculadas para el rango dado,
 * y sus evaluaciones guardadas si existen.
 *
 * Se realizan 5 queries planas (sin N+1) y se componen en JS.
 */
export async function listQAEvaluationsForRange(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<QAEvaluationRow[]> {
  // 1. QA members activos
  const { data: qaMembers, error: qaErr } = await supabase
    .from("qa_members")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (qaErr) throw new Error(`Error al obtener QA members: ${qaErr.message}`);
  const members: QAMemberRow[] = (qaMembers as QAMemberRow[]) ?? [];
  if (members.length === 0) return [];

  const qaNames = members.map((m) => m.name);

  // 2. Tasa de aceptación: tasks asignadas al QA con effort_score_date en el rango
  //    Una tarea puede tener el mismo QA name varias veces en task_qa (poco probable
  //    pero usamos DISTINCT task_id para evitar doble conteo).
  const { data: tasaRaw, error: tasaErr } = await supabase
    .from("task_qa")
    .select("qa_name, tasks!inner(id, effort_score_date)")
    .in("qa_name", qaNames)
    .gte("tasks.effort_score_date", startDate)
    .lte("tasks.effort_score_date", endDate);

  if (tasaErr) throw new Error(`Error al calcular tasa: ${tasaErr.message}`);

  // Contar tareas únicas por qa_name (planificadas = cualquier estado)
  const tasaMap: Record<string, Set<string>> = {};
  for (const row of (tasaRaw as Record<string, unknown>[]) ?? []) {
    const qaName = row.qa_name as string;
    const task = row.tasks as { id: string } | null;
    if (!task) continue;
    if (!tasaMap[qaName]) tasaMap[qaName] = new Set();
    tasaMap[qaName].add(task.id);
  }

  // 3. Cumplimiento: tasks completadas con effort_score_date en el rango
  const { data: completedRaw, error: compErr } = await supabase
    .from("task_qa")
    .select(
      "id, qa_name, tasks!inner(id, tshirt_size, effort_score_date, status)",
    )
    .in("qa_name", qaNames)
    .eq("tasks.status", "Completada")
    .gte("tasks.effort_score_date", startDate)
    .lte("tasks.effort_score_date", endDate);

  if (compErr)
    throw new Error(`Error al obtener tareas completadas: ${compErr.message}`);

  const completedTasks: CompletedTaskRow[] = (
    (completedRaw as Record<string, unknown>[]) ?? []
  ).map((row) => {
    const task = row.tasks as {
      id: string;
      tshirt_size: string;
      status: string;
    };
    return {
      task_id: task.id,
      tshirt_size: task.tshirt_size,
      status: task.status,
      task_qa_id: row.id as string,
      qa_name: row.qa_name as string,
    };
  });

  // 4. Horas registradas por task_qa_id (evita N+1: una query para todos)
  const taskQaIds = completedTasks.map((t) => t.task_qa_id);
  let hoursMap: Record<string, number> = {};

  if (taskQaIds.length > 0) {
    const { data: entriesRaw, error: entriesErr } = await supabase
      .from("timing_qa_entries")
      .select("task_qa_id, timing_qa_category_hours(hours)")
      .in("task_qa_id", taskQaIds);

    if (entriesErr)
      throw new Error(`Error al obtener horas: ${entriesErr.message}`);

    for (const entry of (entriesRaw as Record<string, unknown>[]) ?? []) {
      const tqId = entry.task_qa_id as string;
      const hours = (
        entry.timing_qa_category_hours as { hours: number }[]
      ).reduce((sum, h) => sum + (h.hours ?? 0), 0);
      hoursMap[tqId] = (hoursMap[tqId] ?? 0) + hours;
    }
  }

  // 5. Complexidades para comparar horas
  const { data: complexitiesRaw, error: cxErr } = await supabase
    .from("complexities")
    .select("name, min_hours, max_hours")
    .eq("is_active", true);

  if (cxErr)
    throw new Error(`Error al obtener complejidades: ${cxErr.message}`);

  const complexities: ComplexityRow[] =
    (complexitiesRaw as ComplexityRow[]) ?? [];
  const complexityMap: Record<string, ComplexityRow> = {};
  for (const cx of complexities) {
    complexityMap[cx.name] = cx;
  }

  // Contar tareas completadas únicas por qa_name (para el numerador de la tasa)
  const completadasByQA: Record<string, Set<string>> = {};
  for (const task of completedTasks) {
    if (!completadasByQA[task.qa_name])
      completadasByQA[task.qa_name] = new Set();
    completadasByQA[task.qa_name].add(task.task_id);
  }

  // Calcular cumplimiento por QA
  // Score por tarea: 5 si ≤ max, 4 si ≤ 2×max, 3 si ≤ 3×max, 2 si ≤ 4×max, 1 si > 4×max
  // Cumplimiento final = promedio de scores de tareas con horas registradas
  const cumplimientoScores: Record<string, number[]> = {};
  for (const task of completedTasks) {
    if (task.status !== "Completada") continue; // solo tareas completadas
    const cx = complexityMap[task.tshirt_size];
    if (!cx) continue;
    const totalHours = hoursMap[task.task_qa_id] ?? 0;
    if (totalHours <= 0) continue; // Solo tareas con horas registradas
    const max = cx.max_hours;
    let score: number;
    if (totalHours <= max) score = 5;
    else if (totalHours <= max * 2) score = 4;
    else if (totalHours <= max * 3) score = 3;
    else if (totalHours <= max * 4) score = 2;
    else score = 1;
    if (!cumplimientoScores[task.qa_name])
      cumplimientoScores[task.qa_name] = [];
    cumplimientoScores[task.qa_name].push(score);
  }

  const cumplimientoMap: Record<string, number> = {};
  for (const [qaName, scores] of Object.entries(cumplimientoScores)) {
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    cumplimientoMap[qaName] = Math.round(avg * 100) / 100;
  }

  // 6. Evaluaciones guardadas para el rango
  const qaIds = members.map((m) => m.id);
  const { data: evalRaw, error: evalErr } = await supabase
    .from("qa_evaluations")
    .select(
      "id, qa_id, start_date, end_date, excelencia, soft_skills, comentarios, created_by, created_at, updated_at, tasa_aceptacion, cumplimiento",
    )
    .in("qa_id", qaIds)
    .eq("start_date", startDate)
    .eq("end_date", endDate);

  if (evalErr)
    throw new Error(`Error al obtener evaluaciones: ${evalErr.message}`);

  const evalByQaId: Record<string, EvaluationRow> = {};
  for (const ev of (evalRaw as EvaluationRow[]) ?? []) {
    evalByQaId[ev.qa_id] = ev;
  }

  // Componer resultado final
  return members.map((member) => {
    const ev = evalByQaId[member.id] ?? null;
    const qaName = member.name;
    return {
      id: ev?.id ?? "",
      qa_id: member.id,
      qa_name: qaName,
      start_date: startDate,
      end_date: endDate,
      excelencia: ev?.excelencia ?? null,
      soft_skills: ev?.soft_skills ?? null,
      comentarios: ev?.comentarios ?? null,
      created_by: ev?.created_by ?? null,
      created_at: ev?.created_at,
      updated_at: ev?.updated_at,
      // Usar valor guardado si existe; calcular en tiempo real si es null
      tasa_aceptacion:
        ev?.tasa_aceptacion != null
          ? ev.tasa_aceptacion
          : (() => {
              const planificadas = tasaMap[qaName]?.size ?? 0;
              const completadas = completadasByQA[qaName]?.size ?? 0;
              if (planificadas === 0) return 0;
              return Math.round((completadas / planificadas) * 5 * 100) / 100;
            })(),
      cumplimiento:
        ev?.cumplimiento != null
          ? ev.cumplimiento
          : (cumplimientoMap[qaName] ?? 0),
      has_persisted_evaluation: !!ev,
    };
  });
}

/**
 * Upsert de una evaluación. Devuelve la fila persistida.
 */
export async function upsertQAEvaluation(
  supabase: SupabaseClient,
  userId: string,
  input: UpsertQAEvaluationInput,
): Promise<EvaluationRow> {
  // Construir payload (excluir campos undefined/null explícitamente según intención)
  const payload: Record<string, unknown> = {
    qa_id: input.qa_id,
    start_date: input.start_date,
    end_date: input.end_date,
    updated_at: new Date().toISOString(),
  };

  if (input.excelencia !== undefined) payload.excelencia = input.excelencia;
  if (input.soft_skills !== undefined) payload.soft_skills = input.soft_skills;
  if (input.comentarios !== undefined) payload.comentarios = input.comentarios;

  // Verificar si ya existe para decidir si agregar created_by
  const { data: existing } = await supabase
    .from("qa_evaluations")
    .select("id")
    .eq("qa_id", input.qa_id)
    .eq("start_date", input.start_date)
    .eq("end_date", input.end_date)
    .maybeSingle();

  if (!existing) {
    payload.created_by = userId;
  }

  const { data, error } = await supabase
    .from("qa_evaluations")
    .upsert(payload, {
      onConflict: "qa_id,start_date,end_date",
    })
    .select()
    .single();

  if (error) throw new Error(`Error al guardar evaluación: ${error.message}`);
  return data as EvaluationRow;
}

/**
 * Actualiza campos editables de una evaluación existente.
 */
export async function updateQAEvaluation(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<
    Pick<UpsertQAEvaluationInput, "excelencia" | "soft_skills" | "comentarios">
  >,
): Promise<EvaluationRow> {
  const { data, error } = await supabase
    .from("qa_evaluations")
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Error al actualizar evaluación: ${error.message}`);
  return data as EvaluationRow;
}

/**
 * Elimina una evaluación por ID.
 */
export async function deleteQAEvaluation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("qa_evaluations").delete().eq("id", id);

  if (error) throw new Error(`Error al eliminar evaluación: ${error.message}`);
}
