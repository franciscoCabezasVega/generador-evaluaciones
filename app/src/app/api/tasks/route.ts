import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { CreateTaskInput } from "@/lib/types";
import { calculateTaskScore, validateReturns } from "@/lib/scoreCalculator";
import { getAuthContext } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(request: NextRequest) {
  try {
    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !["admin", "gestor"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to create tasks" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateTaskInput;

    // Validaciones
    if (
      !body.name?.trim() ||
      !body.task_link?.trim() ||
      !body.product_type ||
      !body.squads ||
      body.squads.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required fields or empty squads array" },
        { status: 400 },
      );
    }

    // Validar campos obligatorios nuevos
    if (
      !body.assigned_qa ||
      !Array.isArray(body.assigned_qa) ||
      body.assigned_qa.length === 0
    ) {
      return NextResponse.json(
        { error: "Debe asignar al menos un QA" },
        { status: 400 },
      );
    }

    if (!body.effort_score_date) {
      return NextResponse.json(
        { error: "La fecha de puntuación de esfuerzo es requerida" },
        { status: 400 },
      );
    }

    if (!body.tshirt_size) {
      return NextResponse.json(
        { error: "La complejidad es requerida" },
        { status: 400 },
      );
    }

    // Validar complejidad y tipo de proyecto en paralelo
    const [{ data: complexityExists }, { data: categoryExists }] =
      await Promise.all([
        supabase
          .from("complexities")
          .select("id")
          .eq("name", body.tshirt_size)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("project_types")
          .select("id")
          .eq("name", body.project_type)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

    if (!complexityExists) {
      return NextResponse.json(
        { error: "Complejidad inválida" },
        { status: 400 },
      );
    }

    if (!categoryExists) {
      return NextResponse.json(
        { error: "Tipo de proyecto inválido" },
        { status: 400 },
      );
    }

    // Validar devoluciones en cada squad
    for (const squadData of body.squads) {
      if (
        !validateReturns(squadData.low_returns) ||
        !validateReturns(squadData.medium_returns) ||
        !validateReturns(squadData.high_returns)
      ) {
        return NextResponse.json(
          {
            error: `Returns must be positive integers for squad ${squadData.squad}. Decimals, negative numbers, and letters are not allowed.`,
          },
          { status: 400 },
        );
      }
    }

    const rawIdempotencyKey = request.headers.get("Idempotency-Key");
    // M2: solo aceptar claves con caracteres seguros (máx. 128 chars)
    const IDEMPOTENCY_KEY_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
    const idempotencyKey =
      rawIdempotencyKey && IDEMPOTENCY_KEY_REGEX.test(rawIdempotencyKey)
        ? rawIdempotencyKey
        : null;
    const result = await withIdempotency(
      idempotencyKey,
      user.id,
      "POST",
      "/api/tasks",
      async (): Promise<{ status: number; body: unknown }> => {
        // Calcular scores para cada squad antes de enviar al RPC
        const squadsWithScores = body.squads.map((sq) => ({
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
        }));

        // Llamada atómica: tarea + squads en una sola transacción PG.
        // user_id lo inyecta el RPC desde auth.uid(), no del payload.
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "create_task_with_squads",
          {
            p_input: {
              name: body.name,
              task_link: body.task_link,
              product_type: body.product_type,
              status: body.status,
              month: body.month,
              year: body.year,
              assigned_qa: Array.isArray(body.assigned_qa)
                ? body.assigned_qa
                : [],
              effort_score_date: body.effort_score_date,
              tshirt_size: body.tshirt_size,
              project_type: body.project_type,
              squads: squadsWithScores,
            },
          },
        );

        if (rpcError) {
          if (rpcError.code === "23505") {
            return {
              status: 409,
              body: {
                error:
                  "Este link ya existe en otra tarea. Usa un link diferente.",
              },
            };
          }
          console.error("Error calling create_task_with_squads:", rpcError);
          return { status: 500, body: { error: "Error al crear la tarea" } };
        }

        const rpcData = rpcResult as {
          task: Record<string, unknown>;
          squads: Record<string, unknown>[];
        };
        const task = rpcData.task;
        const taskSquads = Array.isArray(rpcData.squads) ? rpcData.squads : [];

        // Register audit log async (no bloquea la respuesta al usuario)
        const userEmail = user.email || "unknown";
        after(async () => {
          try {
            await supabase.from("audit_logs").insert({
              user_id: user.id,
              user_email: userEmail,
              action: "CREATE",
              entity_type: "TASK",
              entity_id: task.id,
              entity_name: task.name,
              new_values: { ...task, squads: taskSquads },
              timestamp: new Date().toISOString(),
            });
          } catch (auditError) {
            console.error("Error logging audit action:", auditError);
          }
        });

        return { status: 201, body: { ...task, squads: taskSquads } };
      },
    );
    return NextResponse.json(result.body as object, { status: result.status });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Obtener usuario y cliente autenticado
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { supabase } = authCtx;

    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const productType = searchParams.get("product_type");
    const status = searchParams.get("status");
    const squad = searchParams.get("squad");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Obtener tareas — la visibilidad la controla la política RLS (select_tasks_by_role):
    // admin/gestor/viewer ven todas; roles inferiores solo las propias.
    // No aplicar filtro user_id en código: RLS ya lo hace de forma segura en BD.
    let tasksQuery = supabase.from("tasks").select("*");

    if (month) {
      tasksQuery = tasksQuery.eq("month", parseInt(month));
    }
    if (year) {
      tasksQuery = tasksQuery.eq("year", parseInt(year));
    }
    if (productType) {
      tasksQuery = tasksQuery.eq("product_type", productType);
    }
    if (status) {
      tasksQuery = tasksQuery.eq("status", status);
    }
    // Filtrar por rango de effort_score_date (usado en la vista virtual de Tiempos)
    if (startDate) {
      tasksQuery = tasksQuery.gte("effort_score_date", startDate);
    }
    if (endDate) {
      tasksQuery = tasksQuery.lte("effort_score_date", endDate);
    }

    // El filtro de squad requiere una subconsulta en task_squad,
    // ya que el squad no está en la tabla tasks sino en task_squad.
    if (squad) {
      const { data: squadTaskIds, error: squadError } = await supabase
        .from("task_squad")
        .select("task_id")
        .eq("squad", squad);

      if (squadError) {
        console.error("Error fetching squad filter:", squadError);
        return NextResponse.json(
          { error: "Error al filtrar por squad" },
          { status: 400 },
        );
      }

      const ids = (squadTaskIds ?? []).map((r) => r.task_id);
      if (ids.length === 0) {
        // Ninguna tarea tiene ese squad — responder vacío directamente
        return NextResponse.json([]);
      }

      tasksQuery = tasksQuery.in("id", ids);
    }

    const { data: tasks, error: tasksError } = await tasksQuery.order(
      "created_at",
      {
        ascending: false,
      },
    );

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      return NextResponse.json(
        { error: "Error al obtener tareas" },
        { status: 400 },
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json([]);
    }

    // Obtener los squads asociados a cada tarea
    const taskIds = tasks.map((task) => task.id);
    const { data: squadsData, error: squadsError } = await supabase
      .from("task_squad")
      .select("*")
      .in("task_id", taskIds);

    if (squadsError && squadsError.code !== "PGRST116") {
      console.error("Error fetching squad data:", squadsError);
    }

    // Mapear squads a tareas
    const tasksWithSquads = tasks.map((task) => ({
      ...task,
      squads: squadsData?.filter((squad) => squad.task_id === task.id) || [],
    }));

    return NextResponse.json(tasksWithSquads);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
