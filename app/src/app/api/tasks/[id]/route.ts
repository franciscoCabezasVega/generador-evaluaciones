import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { validateReturns, calculateTaskScore } from "@/lib/scoreCalculator";
import { getAuthContext } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";

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

// M2/I-3: compile once at module scope
const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

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

    // Validar devoluciones ANTES de entrar en la sección de escritura
    if (squads && Array.isArray(squads)) {
      // Squad is required unless the project type is "Automatización QA"
      // Only enforce this when squads are explicitly provided as empty
      const squadRequired = body.project_type !== "Automatización QA";
      if (squadRequired && squads.length === 0) {
        return NextResponse.json(
          { error: "Missing required fields or empty squads array" },
          { status: 400 },
        );
      }

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
    }

    const rawIdempotencyKey = request.headers.get("Idempotency-Key");
    // M2/I-1: clave con formato inválido → rechazar con 400 (no degradar silenciosamente)
    if (rawIdempotencyKey && !IDEMPOTENCY_KEY_REGEX.test(rawIdempotencyKey)) {
      return NextResponse.json(
        { error: "Invalid Idempotency-Key format" },
        { status: 400 },
      );
    }
    const idempotencyKey = rawIdempotencyKey ?? null;
    const result = await withIdempotency(
      idempotencyKey,
      user.id,
      "PATCH",
      `/api/tasks/${id}`,
      async (): Promise<{ status: number; body: unknown }> => {
        // Calcular scores para squads (si se proporcionan)
        const squadsWithScores =
          squads && Array.isArray(squads)
            ? squads.map(
                (sq: {
                  squad: string;
                  low_returns: number;
                  medium_returns: number;
                  high_returns: number;
                  additional_notes?: string;
                }) => ({
                  squad: sq.squad,
                  low_returns: sq.low_returns,
                  medium_returns: sq.medium_returns,
                  high_returns: sq.high_returns,
                  calculated_score: calculateTaskScore({
                    lowReturns: sq.low_returns,
                    mediumReturns: sq.medium_returns,
                    highReturns: sq.high_returns,
                  }),
                  additional_notes: sq.additional_notes || "",
                }),
              )
            : undefined;

        const rpcInput: Record<string, unknown> = { ...taskUpdateData };
        if (squadsWithScores !== undefined) rpcInput.squads = squadsWithScores;

        // Llamada atómica: tarea + squads en una sola transacción PG.
        // Devuelve { old_task, new_task, old_squads, new_squads } para el audit log.
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "update_task_with_squads",
          { p_id: id, p_input: rpcInput },
        );

        if (rpcError) {
          // P0002 = no_data_found: stable SQLSTATE raised by the RPC when the
          // task does not exist. Avoids fragile substring match on message text.
          if (rpcError.code === "P0002") {
            return { status: 404, body: { error: "Task not found" } };
          }
          if (rpcError.code === "42501") {
            return { status: 401, body: { error: "Unauthorized" } };
          }
          console.error("Error calling update_task_with_squads:", rpcError);
          return {
            status: 400,
            body: { error: "Error al actualizar la tarea" },
          };
        }

        type SquadRow = Record<string, unknown>;
        const rpcData = rpcResult as {
          old_task: Record<string, unknown>;
          new_task: Record<string, unknown>;
          old_squads: SquadRow[];
          new_squads: SquadRow[];
        };
        const updatedTask = rpcData.new_task;
        const updatedSquads = Array.isArray(rpcData.new_squads)
          ? rpcData.new_squads
          : [];
        const snapshotTask = rpcData.old_task;
        const snapshotSquads = Array.isArray(rpcData.old_squads)
          ? rpcData.old_squads
          : [];

        // Construir diff para el audit log
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        const fieldsToIgnore = ["additional_notes"];

        Object.keys(body).forEach((key) => {
          if (key !== "squads" && !fieldsToIgnore.includes(key)) {
            const oldVal = snapshotTask?.[key];
            const newVal = body[key] as unknown;
            if (Array.isArray(newVal) || Array.isArray(oldVal)) {
              const oldArr = Array.isArray(oldVal)
                ? [...(oldVal as unknown[])].sort()
                : [];
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
        if (updatedSquads.length > 0 || snapshotSquads.length > 0) {
          const changedSquads: { old: SquadRow[]; new: SquadRow[] } = {
            old: [],
            new: [],
          };
          const oldSquadMap = new Map<unknown, SquadRow>(
            snapshotSquads.map((sq) => [sq.squad, sq]),
          );
          const newSquadMap = new Map<unknown, SquadRow>(
            updatedSquads.map((sq) => [sq.squad, sq]),
          );
          const allSquadNames = new Set([
            ...oldSquadMap.keys(),
            ...newSquadMap.keys(),
          ]);

          const n = (v: unknown): number => (v != null ? Number(v) : 0);

          for (const squadName of allSquadNames) {
            const oldSquad = oldSquadMap.get(squadName);
            const newSquad = newSquadMap.get(squadName);
            if (oldSquad && !newSquad) {
              changedSquads.old.push({ ...oldSquad });
            } else if (!oldSquad && newSquad) {
              changedSquads.new.push({ ...newSquad });
            } else if (oldSquad && newSquad) {
              if (
                n(oldSquad.low_returns) !== n(newSquad.low_returns) ||
                n(oldSquad.medium_returns) !== n(newSquad.medium_returns) ||
                n(oldSquad.high_returns) !== n(newSquad.high_returns) ||
                n(oldSquad.calculated_score) !== n(newSquad.calculated_score) ||
                (oldSquad.additional_notes || "") !==
                  (newSquad.additional_notes || "")
              ) {
                changedSquads.old.push({ ...oldSquad });
                changedSquads.new.push({ ...newSquad });
              }
            }
          }

          if (changedSquads.old.length > 0 || changedSquads.new.length > 0) {
            changes.squads = changedSquads;
          }
        }

        // Audit log async: no bloquea la respuesta al cliente
        after(async () => {
          try {
            await supabase.from("audit_logs").insert({
              user_id: user.id,
              user_email: user.email || "unknown",
              action: "UPDATE",
              entity_type: "TASK",
              entity_id: id,
              entity_name: updatedTask?.name,
              changes,
              old_values: snapshotTask,
              new_values: { ...updatedTask, squads: updatedSquads },
              timestamp: new Date().toISOString(),
            });
          } catch (auditError) {
            console.error("Error logging audit action:", auditError);
          }
        });

        return { status: 200, body: { ...updatedTask, squads: updatedSquads } };
      },
    );
    return NextResponse.json(result.body as object, { status: result.status });
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

    const rawIdempotencyKeyDelete = request.headers.get("Idempotency-Key");
    if (
      rawIdempotencyKeyDelete &&
      !IDEMPOTENCY_KEY_REGEX.test(rawIdempotencyKeyDelete)
    ) {
      return NextResponse.json(
        { error: "Invalid Idempotency-Key format" },
        { status: 400 },
      );
    }
    const idempotencyKey = rawIdempotencyKeyDelete ?? null;
    const result = await withIdempotency(
      idempotencyKey,
      user.id,
      "DELETE",
      `/api/tasks/${id}`,
      async (): Promise<{ status: number; body: unknown }> => {
        // Verificar existencia DENTRO de withIdempotency para que el cache pueda
        // servir el 200 en duplicados sin volver a hacer el pre-flight.
        // RLS aplica restricciones de acceso por rol.
        const { data: existingTask, error: getError } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", id)
          .single();

        if (getError || !existingTask) {
          return { status: 404, body: { error: "Task not found" } };
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
          return { status: 400, body: { error: "Error al eliminar la tarea" } };
        }

        // Register audit log async (no bloquea la respuesta al cliente)
        const userEmail = user.email || "unknown";
        const auditPayload = {
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
        };
        after(async () => {
          try {
            await supabase.from("audit_logs").insert(auditPayload);
          } catch (auditError) {
            console.error("Error logging audit action:", auditError);
          }
        });

        return { status: 200, body: { success: true } };
      },
    );
    return NextResponse.json(result.body as object, { status: result.status });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
