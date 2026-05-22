import "server-only";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthContext, getServiceClient } from "@/lib/auth";
import {
  extractClickUpTaskId,
  getClickUpApiKey,
  isClickUpUrl,
} from "@/lib/services/clickupService";
import { sanitizeForPrompt } from "@/lib/utils/sanitizePrompt";
import type { AISuggestions, AIAutofillResponse } from "@/lib/types";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

// ── Tipos internos para la respuesta de ClickUp ───────────────────────────

interface ClickUpTaskResponse {
  id: string;
  name: string;
  description?: string;
  status?: { status: string; color?: string };
  due_date?: string | null;
  date_created?: string;
  custom_fields?: Array<{
    id: string;
    name: string;
    value?: unknown;
  }>;
  assignees?: Array<{
    id: number;
    username: string;
    email?: string;
  }>;
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  tags?: Array<{ name: string }>;
}

// ── Helper: fetch de la tarea desde ClickUp ───────────────────────────────

async function fetchClickUpTask(
  taskId: string,
  apiKey: string,
): Promise<ClickUpTaskResponse> {
  const url = `${CLICKUP_API_BASE}/task/${taskId}`;
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 404) {
    throw Object.assign(new Error("Tarea no encontrada en ClickUp"), {
      code: "NOT_FOUND",
    });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`ClickUp API error ${response.status}:`, body.slice(0, 500));
    throw Object.assign(
      new Error(`Error al comunicarse con ClickUp (status ${response.status})`),
      { code: "CLICKUP_ERROR" },
    );
  }

  return response.json() as Promise<ClickUpTaskResponse>;
}

// ── Helper: cargar catálogos activos desde BD ─────────────────────────────

async function loadActiveCatalogs() {
  const supabase = getServiceClient();
  if (!supabase) throw new Error("Service client unavailable");

  const [products, projectTypes, complexities, squads, qaMembers] =
    await Promise.all([
      supabase.from("products").select("id, name").eq("is_active", true),
      supabase.from("project_types").select("id, name").eq("is_active", true),
      supabase.from("complexities").select("id, name").eq("is_active", true),
      supabase
        .from("squads")
        .select("id, name, product_id")
        .eq("is_active", true),
      supabase
        .from("qa_members")
        .select("id, name, clickup_user_id")
        .eq("is_active", true),
    ]);

  if (products.error) throw new Error(`BD products: ${products.error.message}`);
  if (projectTypes.error)
    throw new Error(`BD project_types: ${projectTypes.error.message}`);
  if (complexities.error)
    throw new Error(`BD complexities: ${complexities.error.message}`);
  if (squads.error) throw new Error(`BD squads: ${squads.error.message}`);
  if (qaMembers.error)
    throw new Error(`BD qa_members: ${qaMembers.error.message}`);

  return {
    products: products.data ?? [],
    projectTypes: projectTypes.data ?? [],
    complexities: complexities.data ?? [],
    squads: squads.data ?? [],
    qaMembers: qaMembers.data ?? [],
  };
}

// ── POST /api/tasks/ai-autofill ───────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verificar OPENAI_API_KEY
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "API key de OpenAI no configurada en el servidor" },
        { status: 500 },
      );
    }

    // 2. Verificar autenticación y rol
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json(
        { error: "No autorizado — debes iniciar sesión" },
        { status: 401 },
      );
    }
    if (!authCtx.role || !["admin", "gestor"].includes(authCtx.role)) {
      return NextResponse.json(
        { error: "No tienes permisos para usar esta funcionalidad" },
        { status: 403 },
      );
    }

    // 3. Parsear body
    const body = await request.json().catch(() => ({}));
    const { linkOrId } = body as { linkOrId?: string };

    if (!linkOrId || typeof linkOrId !== "string" || !linkOrId.trim()) {
      return NextResponse.json(
        { error: "El campo linkOrId es requerido" },
        { status: 400 },
      );
    }

    // 4. Validar que sea una URL/ID de ClickUp
    if (!isClickUpUrl(linkOrId.trim())) {
      return NextResponse.json(
        {
          error:
            "El link no corresponde a una tarea de ClickUp. Usa una URL de app.clickup.com o un ID de tarea.",
        },
        { status: 400 },
      );
    }

    // 5. Obtener API key de ClickUp
    let clickupApiKey: string | null;
    try {
      clickupApiKey = await getClickUpApiKey();
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Error al obtener la API key de ClickUp",
        },
        { status: 503 },
      );
    }

    if (!clickupApiKey) {
      return NextResponse.json(
        {
          error:
            "La API key de ClickUp no está configurada. Configúrala en Ajustes.",
        },
        { status: 503 },
      );
    }

    // 6. Extraer task ID y cargar catálogos en paralelo con el fetch de ClickUp
    const taskId = extractClickUpTaskId(linkOrId.trim());

    let clickupTask: ClickUpTaskResponse;
    let catalogs: Awaited<ReturnType<typeof loadActiveCatalogs>>;
    try {
      [clickupTask, catalogs] = await Promise.all([
        fetchClickUpTask(taskId, clickupApiKey),
        loadActiveCatalogs(),
      ]);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "NOT_FOUND") {
        return NextResponse.json(
          { error: `Tarea ${taskId} no encontrada en ClickUp` },
          { status: 404 },
        );
      }
      if (e.message?.includes("Service client unavailable")) {
        return NextResponse.json(
          { error: "Error interno al cargar catálogos" },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: e.message || "Error al consultar ClickUp" },
        { status: 502 },
      );
    }

    // 7. Construir contexto para el prompt (sanitizado)
    const taskContext = {
      id: clickupTask.id,
      name: sanitizeForPrompt(clickupTask.name ?? "", 200),
      description: sanitizeForPrompt(clickupTask.description ?? "", 500),
      status: sanitizeForPrompt(clickupTask.status?.status ?? "", 100),
      list_name: sanitizeForPrompt(clickupTask.list?.name ?? "", 100),
      folder_name: sanitizeForPrompt(clickupTask.folder?.name ?? "", 100),
      tags: (clickupTask.tags ?? [])
        .map((t) => sanitizeForPrompt(t.name, 50))
        .slice(0, 10),
      assignee_ids: (clickupTask.assignees ?? []).map((a) => String(a.id)),
      assignee_usernames: (clickupTask.assignees ?? [])
        .map((a) => sanitizeForPrompt(a.username ?? "", 50))
        .slice(0, 10),
    };

    const catalogContext = {
      products: catalogs.products.map((p) => p.name),
      project_types: catalogs.projectTypes.map((pt) => pt.name),
      complexities: catalogs.complexities.map((c) => c.name),
      squads: catalogs.squads.map((s) => ({
        name: s.name,
        product_id: s.product_id,
        product_name:
          catalogs.products.find((p) => p.id === s.product_id)?.name ?? "",
      })),
      qa_members: catalogs.qaMembers.map((q) => ({
        name: q.name,
        clickup_user_id: q.clickup_user_id ?? null,
      })),
    };

    // 9. Llamar a OpenAI con response_format json_object
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 25_000,
    });

    const systemPrompt = `Eres un asistente que mapea información de tareas de ClickUp a campos de un formulario de evaluación QA.
Devuelve un único objeto JSON con las siguientes claves (todas opcionales — usa null si no puedes inferir con confianza):

{
  "name": string | null,
  "product_type": string | null,
  "project_type": string | null,
  "tshirt_size": string | null,
  "status": "Pendiente" | "Completada" | "Deprecada" | null,
  "month": number (1-12) | null,
  "year": number (YYYY) | null,
  "effort_score_date": string ("YYYY-MM-DD") | null,
  "squads": Array<{ "squad": string, "low_returns": 0, "medium_returns": 0, "high_returns": 0 }> | null,
  "assigned_qa": string[] | null
}

Reglas estrictas:
- product_type DEBE ser exactamente uno de los valores de catalog.products, o null.
- project_type DEBE ser exactamente uno de los valores de catalog.project_types, o null.
- tshirt_size DEBE ser exactamente uno de los valores de catalog.complexities, o null.
- status: usa "Pendiente" si la tarea no está cerrada/done, "Completada" si está closed/done/complete, "Deprecada" si está cancelada/deprecated.
- month y year: inferir del due_date de ClickUp o del contexto. IMPORTANTE: el año SOLO puede ser ${new Date().getFullYear()} en adelante; si la fecha inferida corresponde a un año anterior, devuelve null para year. Si no hay dato confiable, null.
- effort_score_date: si hay due_date o fecha de creación relevante, úsala en formato YYYY-MM-DD. Si no, null.
- squads: SOLO incluye squads si la información de la tarea menciona explícitamente uno o más equipos por nombre. Si no hay mención directa de un squad específico, devuelve null. NO infieras squads solo porque pertenecen al producto — el usuario los asigna manualmente. Usa los nombres exactos del catálogo. Los returns siempre son 0.
- assigned_qa: preferir match por clickup_user_id si coincide con un assignee. Si no, match por nombre similar. Solo nombres exactos del catálogo.
- NO inventes valores que no existan en los catálogos.
- Si no puedes inferir un campo con confianza, devuelve null. Es mejor null que un valor incorrecto.`;

    const userMessage = `Catálogos válidos:
${JSON.stringify(catalogContext, null, 2)}

Datos de la tarea ClickUp:
${JSON.stringify(taskContext, null, 2)}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const rawJson = completion.choices[0]?.message?.content ?? "{}";

    // 10. Parsear y validar contra catálogos (descartar valores inválidos)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const productNames = catalogs.products.map((p) => p.name);
    const projectTypeNames = catalogs.projectTypes.map((pt) => pt.name);
    const complexityNames = catalogs.complexities.map((c) => c.name);
    const squadNames = catalogs.squads.map((s) => s.name);
    const qaNames = catalogs.qaMembers.map((q) => q.name);
    const validStatuses = ["Pendiente", "Completada", "Deprecada"];

    const suggestions: AISuggestions = {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim().slice(0, 500)
          : null,
      product_type:
        typeof parsed.product_type === "string" &&
        productNames.includes(parsed.product_type)
          ? parsed.product_type
          : null,
      project_type:
        typeof parsed.project_type === "string" &&
        projectTypeNames.includes(parsed.project_type)
          ? parsed.project_type
          : null,
      tshirt_size:
        typeof parsed.tshirt_size === "string" &&
        complexityNames.includes(parsed.tshirt_size)
          ? parsed.tshirt_size
          : null,
      status:
        typeof parsed.status === "string" &&
        validStatuses.includes(parsed.status)
          ? (parsed.status as "Pendiente" | "Completada" | "Deprecada")
          : null,
      month:
        typeof parsed.month === "number" &&
        parsed.month >= 1 &&
        parsed.month <= 12
          ? parsed.month
          : null,
      year: (() => {
        const minYear = new Date().getFullYear();
        return typeof parsed.year === "number" &&
          parsed.year >= minYear &&
          parsed.year <= 2100
          ? parsed.year
          : null;
      })(),
      effort_score_date: (() => {
        if (typeof parsed.effort_score_date !== "string") return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.effort_score_date)) return null;
        const ts = Date.parse(parsed.effort_score_date);
        return isNaN(ts) ? null : parsed.effort_score_date;
      })(),
      squads: Array.isArray(parsed.squads)
        ? (
            parsed.squads as Array<{
              squad?: unknown;
              low_returns?: unknown;
              medium_returns?: unknown;
              high_returns?: unknown;
            }>
          )
            .filter(
              (s) =>
                typeof s.squad === "string" && squadNames.includes(s.squad),
            )
            .map((s) => ({
              squad: s.squad as string,
              low_returns: 0,
              medium_returns: 0,
              high_returns: 0,
            }))
            .slice(0, 10) || null
        : null,
      assigned_qa: Array.isArray(parsed.assigned_qa)
        ? (parsed.assigned_qa as unknown[])
            .filter(
              (q) => typeof q === "string" && qaNames.includes(q as string),
            )
            .map((q) => q as string)
            .slice(0, 20)
        : null,
    };

    // Limpiar arrays vacíos → null
    if (suggestions.squads !== null && suggestions.squads?.length === 0)
      suggestions.squads = null;
    if (
      suggestions.assigned_qa !== null &&
      suggestions.assigned_qa?.length === 0
    )
      suggestions.assigned_qa = null;

    const result: AIAutofillResponse = {
      suggestions,
      source: {
        clickup_task_id: taskId,
        clickup_status: clickupTask.status?.status ?? "",
        raw_excerpt: sanitizeForPrompt(clickupTask.name ?? "", 200),
      },
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error("[ai-autofill] Error inesperado:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 },
    );
  }
}
