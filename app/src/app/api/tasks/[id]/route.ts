import { NextRequest, NextResponse } from "next/server";
import { validateReturns, calculateTaskScore } from "@/lib/scoreCalculator";
import { getAuthContext } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Obtener usuario y cliente autenticado
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { supabase } = authCtx;

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (taskError) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Obtener los datos de task_squad
    const { data: squadsData, error: squadsError } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    if (squadsError && squadsError.code !== "PGRST116") {
      console.error("Error fetching squad data:", squadsError);
    }

    return NextResponse.json({
      ...task,
      squads: squadsData || [],
    });
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !["admin", "gestor"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to edit tasks" },
        { status: 403 },
      );
    }

    const body = await request.json();

    // Verificar que la tarea existe (RLS ya aplica restricciones de acceso por rol)
    const { data: existingTask, error: getError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (getError || !existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Separar squads de los datos de la tarea
    const { squads, assigned_qa, ...taskUpdateData } = body;

    // Si se proporcionan QA asignados, incluir en la actualización
    if (Array.isArray(assigned_qa)) {
      taskUpdateData.assigned_qa = assigned_qa;
    }

    // Validar complejidad y tipo de proyecto en paralelo (solo si se proporcionan)
    if (taskUpdateData.tshirt_size || taskUpdateData.project_type) {
      const [complexityResult, categoryResult] = await Promise.all([
        taskUpdateData.tshirt_size
          ? supabase
              .from("complexities")
              .select("id")
              .eq("name", taskUpdateData.tshirt_size)
              .eq("is_active", true)
              .maybeSingle()
          : Promise.resolve({ data: true }),
        taskUpdateData.project_type
          ? supabase
              .from("project_types")
              .select("id")
              .eq("name", taskUpdateData.project_type)
              .eq("is_active", true)
              .maybeSingle()
          : Promise.resolve({ data: true }),
      ]);

      if (taskUpdateData.tshirt_size && !complexityResult.data) {
        return NextResponse.json(
          { error: "Complejidad inválida" },
          { status: 400 },
        );
      }

      if (taskUpdateData.project_type && !categoryResult.data) {
        return NextResponse.json(
          { error: "Tipo de proyecto inválido" },
          { status: 400 },
        );
      }
    }

    // Obtener squads ANTES de actualizar para capturar cambios
    const { data: existingSquads } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    // Actualizar tarea
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({
        ...taskUpdateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: "Error al actualizar la tarea" },
        { status: 400 },
      );
    }

    // Si se proporcionan squads, actualizar task_squad
    if (squads && Array.isArray(squads)) {
      // Validar todas las devoluciones ANTES de hacer cualquier write
      for (const squadData of squads) {
        if (
          !validateReturns(squadData.low_returns) ||
          !validateReturns(squadData.medium_returns) ||
          !validateReturns(squadData.high_returns)
        ) {
          return NextResponse.json(
            {
              error: `Returns must be positive integers for squad ${squadData.squad}`,
            },
            { status: 400 },
          );
        }
      }

      const existingSquadNames = (existingSquads || []).map((sq) => sq.squad);
      const newSquadNames = squads.map((sq: { squad: string }) => sq.squad);

      // Eliminar squads que ya no están
      const squadsToDelete = existingSquadNames.filter(
        (sq) => !newSquadNames.includes(sq),
      );
      if (squadsToDelete.length > 0) {
        await supabase
          .from("task_squad")
          .delete()
          .eq("task_id", id)
          .in("squad", squadsToDelete);
      }

      // Batch upsert: preparar todos los registros y enviar en una sola query
      const upsertRecords = squads.map(
        (squadData: {
          squad: string;
          low_returns: number;
          medium_returns: number;
          high_returns: number;
          additional_notes?: string;
        }) => {
          const calculatedScore = calculateTaskScore({
            lowReturns: squadData.low_returns,
            mediumReturns: squadData.medium_returns,
            highReturns: squadData.high_returns,
          });
          return {
            task_id: id,
            squad: squadData.squad,
            low_returns: squadData.low_returns,
            medium_returns: squadData.medium_returns,
            high_returns: squadData.high_returns,
            calculated_score: calculatedScore,
            additional_notes: squadData.additional_notes || "",
            updated_at: new Date().toISOString(),
          };
        },
      );

      const { error: squadUpsertError } = await supabase
        .from("task_squad")
        .upsert(upsertRecords, { onConflict: "task_id,squad" });

      if (squadUpsertError) {
        console.error("Error upserting squads:", squadUpsertError);
        return NextResponse.json(
          { error: "Error al actualizar squads" },
          { status: 400 },
        );
      }
    }

    // Obtener squads actualizados ANTES de crear el audit log
    const { data: updatedSquads } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    // Register audit log
    const userEmail = user.email || "unknown";
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    // Campos que no deben registrarse como cambios de tarea (pertenecen a squads)
    const fieldsToIgnore = ["additional_notes"];

    // Capturar cambios en campos de tarea
    Object.keys(body).forEach((key) => {
      if (key !== "squads" && !fieldsToIgnore.includes(key)) {
        const oldVal = existingTask[key as keyof typeof existingTask];
        const newVal = body[key];

        // Comparación especial para arrays (assigned_qa)
        if (Array.isArray(newVal) || Array.isArray(oldVal)) {
          const oldArr = Array.isArray(oldVal) ? [...oldVal].sort() : [];
          const newArr = Array.isArray(newVal) ? [...newVal].sort() : [];
          if (JSON.stringify(oldArr) !== JSON.stringify(newArr)) {
            changes[key] = { old: oldVal ?? [], new: newVal };
          }
        } else if (oldVal !== newVal) {
          changes[key] = { old: oldVal, new: newVal };
        }
      }
    });

    // Capturar cambios en squads - SOLO los que realmente cambiaron
    if (Array.isArray(updatedSquads) || Array.isArray(existingSquads)) {
      const changedSquads = {
        old: [] as Record<string, unknown>[],
        new: [] as Record<string, unknown>[],
      };

      const oldSquadMap = new Map(
        (existingSquads || []).map((sq) => [sq.squad, sq]),
      );
      const newSquadMap = new Map(
        (updatedSquads || []).map((sq) => [sq.squad, sq]),
      );

      // Conjunto de todos los squads (viejos + nuevos)
      const allSquadNames = new Set([
        ...oldSquadMap.keys(),
        ...newSquadMap.keys(),
      ]);

      // Comparar cada squad
      for (const squadName of allSquadNames) {
        const oldSquad = oldSquadMap.get(squadName);
        const newSquad = newSquadMap.get(squadName);

        // Si el squad fue eliminado
        if (oldSquad && !newSquad) {
          changedSquads.old.push({ ...oldSquad });
        }
        // Si el squad es nuevo
        else if (!oldSquad && newSquad) {
          changedSquads.new.push({ ...newSquad });
        }
        // Si el squad existe en ambas versiones, comparar sus valores
        else if (oldSquad && newSquad) {
          // Normalizar valores: null/undefined → 0, pero mantener la distinción en la comparación
          // Esto permite detectar cambios de 0 hacia valores diferentes y viceversa
          const oldLow =
            oldSquad.low_returns !== null && oldSquad.low_returns !== undefined
              ? Number(oldSquad.low_returns)
              : 0;
          const newLow =
            newSquad.low_returns !== null && newSquad.low_returns !== undefined
              ? Number(newSquad.low_returns)
              : 0;
          const oldMedium =
            oldSquad.medium_returns !== null &&
            oldSquad.medium_returns !== undefined
              ? Number(oldSquad.medium_returns)
              : 0;
          const newMedium =
            newSquad.medium_returns !== null &&
            newSquad.medium_returns !== undefined
              ? Number(newSquad.medium_returns)
              : 0;
          const oldHigh =
            oldSquad.high_returns !== null &&
            oldSquad.high_returns !== undefined
              ? Number(oldSquad.high_returns)
              : 0;
          const newHigh =
            newSquad.high_returns !== null &&
            newSquad.high_returns !== undefined
              ? Number(newSquad.high_returns)
              : 0;
          const oldScore =
            oldSquad.calculated_score !== null &&
            oldSquad.calculated_score !== undefined
              ? Number(oldSquad.calculated_score)
              : 0;
          const newScore =
            newSquad.calculated_score !== null &&
            newSquad.calculated_score !== undefined
              ? Number(newSquad.calculated_score)
              : 0;
          const oldNotes = oldSquad.additional_notes || "";
          const newNotes = newSquad.additional_notes || "";

          const lowChanged = oldLow !== newLow;
          const mediumChanged = oldMedium !== newMedium;
          const highChanged = oldHigh !== newHigh;
          const scoreChanged = oldScore !== newScore;
          const notesChanged = oldNotes !== newNotes;

          if (
            lowChanged ||
            mediumChanged ||
            highChanged ||
            scoreChanged ||
            notesChanged
          ) {
            // Squad existente con cambios - CLONAR OBJETOS para evitar referencias compartidas
            changedSquads.old.push({ ...oldSquad });
            changedSquads.new.push({ ...newSquad });
          }
        }
      }

      // Solo registrar cambios si hubo squads que realmente cambiaron
      if (changedSquads.old.length > 0 || changedSquads.new.length > 0) {
        changes["squads"] = changedSquads;
      }
    }

    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: userEmail,
        action: "UPDATE",
        entity_type: "TASK",
        entity_id: id,
        entity_name: updatedTask.name,
        changes,
        old_values: existingTask,
        new_values: { ...updatedTask, squads: updatedSquads || [] },
        timestamp: new Date().toISOString(),
      });
    } catch (auditError) {
      console.error("Error logging audit action:", auditError);
    }

    return NextResponse.json({
      ...updatedTask,
      squads: updatedSquads || [],
    });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !["admin", "gestor"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to delete tasks" },
        { status: 403 },
      );
    }

    // Verificar que la tarea existe (RLS ya aplica restricciones de acceso por rol)
    const { data: existingTask, error: getError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (getError || !existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Obtener squads ANTES de eliminar (para audit log)
    const { data: existingSquads } = await supabase
      .from("task_squad")
      .select("*")
      .eq("task_id", id);

    // Eliminar tarea (task_squad se elimina automáticamente por ON DELETE CASCADE)
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting task:", deleteError);
      return NextResponse.json(
        { error: "Error al eliminar la tarea" },
        { status: 400 },
      );
    }

    // Register audit log
    const userEmail = user.email || "unknown";

    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: userEmail,
        action: "DELETE",
        entity_type: "TASK",
        entity_id: id,
        entity_name: existingTask.name,
        old_values: {
          ...existingTask,
          squads: existingSquads || [],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (auditError) {
      console.error("Error logging audit action:", auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
