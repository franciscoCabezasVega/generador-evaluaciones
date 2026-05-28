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

interface ClickUpCustomField {
  id: string;
  name: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: Array<{
      id: string;
      name?: string; // drop_down usa name
      label?: string; // labels usa label
      orderindex?: number;
      color?: string;
    }>;
  };
}

interface ClickUpTaskResponse {
  id: string;
  name: string;
  description?: string;
  status?: { status: string; color?: string };
  due_date?: string | null;
  date_created?: string;
  custom_fields?: ClickUpCustomField[];
  assignees?: Array<{
    id: number;
    username: string;
    email?: string;
  }>;
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  tags?: Array<{ name: string }>;
}

// ── Helper: resolver el valor legible de un custom field de ClickUp ────────
// ClickUp devuelve valores en formatos distintos según el tipo de campo:
// - labels: array de objetos {id, label/name, color, orderindex}
// - drop_down: orderindex (number) resolvible vía type_config.options
// - people: array de objetos {id, username, email, ...}
// - text/url/email: string directo

function resolveCustomFieldValue(field: ClickUpCustomField): string {
  const { value, type, type_config } = field;
  if (value === null || value === undefined) return "";

  // Arrays (labels, people, multi-select)
  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length === 0) return "";

    return items
      .map((item) => {
        if (typeof item === "string") {
          // Array de IDs de opción → resolver via type_config
          // Nota: labels usa "label", drop_down usa "name"
          const opt = type_config?.options?.find((o) => o.id === item);
          return opt?.label ?? opt?.name ?? "";
        }
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          // Labels: {id, label/name, color}
          // People: {id, username, email, profilePicture}
          return (
            (obj.label as string) ||
            (obj.name as string) ||
            (obj.username as string) ||
            (obj.email as string) ||
            ""
          );
        }
        return typeof item === "number" ? String(item) : "";
      })
      .filter(Boolean)
      .join(", ");
  }

  // Dropdown: value es el orderindex de la opción seleccionada
  if (
    type === "drop_down" &&
    typeof value === "number" &&
    type_config?.options
  ) {
    const option = type_config.options.find((o) => o.orderindex === value);
    if (option?.name ?? option?.label) return (option.name ?? option.label)!;
    // Fallback: buscar por id
    const byId = type_config.options.find((o) => o.id === String(value));
    if (byId?.name ?? byId?.label) return (byId!.name ?? byId!.label)!;
  }

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.label === "string") return obj.label;
    if (typeof obj.username === "string") return obj.username;
    if (typeof obj.value === "string") return obj.value;
  }

  return "";
}

// ── Helper: resolver el estado de ClickUp al enum local ─────────────────

function resolveClickUpStatus(
  raw: string,
): "Pendiente" | "Completada" | "Deprecada" | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (/complet|done|close|finish|cerrad|terminad/i.test(s)) return "Completada";
  if (/cancel|deprecat|obsolet|won.?t|discard|descart|baja/i.test(s))
    return "Deprecada";
  if (
    /open|to.?do|progress|review|testing|pending|active|nuevo|nueva|activ/i.test(
      s,
    )
  )
    return "Pendiente";
  // Cualquier estado que no sea claramente completado/deprecado → Pendiente
  return "Pendiente";
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

    // 7. Pre-resoluciones server-side para campos críticos
    // (más confiables que dejarle el matching a la IA)

    // 7a. Status: mapear el estado raw de ClickUp directamente
    const preResolvedStatus = resolveClickUpStatus(
      clickupTask.status?.status ?? "",
    );

    // 7b. Squad: extraer campo "Equipo" y hacer matching contra catálogo
    const equipoCF = (clickupTask.custom_fields ?? []).find((cf) =>
      // Permisivo: coincidencia parcial para cubrir "Equipo", "Equipo Asignado", etc.
      /equipo|squad|team/i.test(cf.name.trim()),
    );
    const equipoRawValue = equipoCF ? resolveCustomFieldValue(equipoCF) : "";
    let preResolvedSquad: string | null = null;
    let preResolvedProductType: string | null = null;
    if (equipoRawValue) {
      const norm = equipoRawValue.toLowerCase().trim();
      // Intento 1: coincidencia exacta
      const exact = catalogs.squads.find((s) => s.name.toLowerCase() === norm);
      if (exact) {
        preResolvedSquad = exact.name;
        preResolvedProductType =
          catalogs.products.find((p) => p.id === exact.product_id)?.name ??
          null;
      } else {
        // Intento 2: extraer número de squad + producto
        // "Apps - Squad 3" → num=3, productHint="apps"
        const numMatch = norm.match(/squad\s*(\d+)/i);
        const productHint = norm.split(/\s*[-\u2013]\s*/)[0].trim();
        if (numMatch) {
          const num = numMatch[1];
          const candidate = catalogs.squads.find((s) => {
            const sLower = s.name.toLowerCase();
            const productName = (
              catalogs.products.find((p) => p.id === s.product_id)?.name ?? ""
            ).toLowerCase();
            return (
              sLower.includes(`squad ${num}`) &&
              (productHint === "" || productName.includes(productHint))
            );
          });
          if (candidate) {
            preResolvedSquad = candidate.name;
            preResolvedProductType =
              catalogs.products.find((p) => p.id === candidate.product_id)
                ?.name ?? null;
          }
        }
        // Intento 3: si no se encontró por número, buscar por nombre de producto solo
        if (!preResolvedSquad && productHint) {
          const byProduct = catalogs.squads.find((s) => {
            const productName = (
              catalogs.products.find((p) => p.id === s.product_id)?.name ?? ""
            ).toLowerCase();
            return productName.includes(productHint);
          });
          if (byProduct) {
            preResolvedSquad = byProduct.name;
            preResolvedProductType =
              catalogs.products.find((p) => p.id === byProduct.product_id)
                ?.name ?? null;
          }
        }
      }
    }

    // 7c. QA Asignado: extraer IDs del campo people y hacer match por clickup_user_id
    const qaAsignadoCF = (clickupTask.custom_fields ?? []).find((cf) =>
      /qa\s*asignado|assigned\s*qa|qa\s*assigned/i.test(cf.name.trim()),
    );
    const preResolvedQA: string[] = [];
    if (qaAsignadoCF && Array.isArray(qaAsignadoCF.value)) {
      // Intento 1: match por clickup_user_id (cuando está configurado en la BD)
      const userIds = (qaAsignadoCF.value as unknown[])
        .filter(
          (v): v is Record<string, unknown> =>
            typeof v === "object" && v !== null,
        )
        .map((v) => String(v.id ?? ""))
        .filter(Boolean);
      for (const uid of userIds) {
        const member = catalogs.qaMembers.find(
          (q) => q.clickup_user_id === uid,
        );
        if (member) preResolvedQA.push(member.name);
      }

      // Intento 2: match por username o email contra nombre del QA member
      if (preResolvedQA.length === 0) {
        const userIdentifiers = (qaAsignadoCF.value as unknown[])
          .filter(
            (v): v is Record<string, unknown> =>
              typeof v === "object" && v !== null,
          )
          .flatMap((v) => [
            (v.username as string) ?? "",
            // Extraer apellido del email si está disponible: "jgonzalez@x.com" → "gonzalez"
            ((v.email as string) ?? "")
              .split("@")[0]
              .replace(/[._-]/g, " ")
              .toLowerCase(),
          ])
          .filter(Boolean);

        for (const identifier of userIdentifiers) {
          const idLower = identifier.toLowerCase();
          // Buscar por coincidencia de palabra en el nombre completo del QA member
          const member = catalogs.qaMembers.find((q) => {
            const nameParts = q.name.toLowerCase().split(/\s+/);
            return nameParts.some(
              (part: string) =>
                part.length > 3 &&
                (idLower.includes(part) || part.includes(idLower)),
            );
          });
          if (member && !preResolvedQA.includes(member.name)) {
            preResolvedQA.push(member.name);
          }
        }
      }
    }

    // 8. Construir contexto para el prompt (sanitizado)
    // Solo se envían los campos relevantes para el formulario; no todos los custom fields
    const RELEVANT_CF_PATTERNS = [
      /talla|size|complejidad|complexity|t[- ]?shirt/i,
      /equipo|squad|team/i,
      /tipo\s*(de\s*)?proyecto|project\s*type/i,
      /qa\s*asignado|assigned\s*qa/i,
      /^riesgo$|^prioridad/i,
    ];
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
      // Solo custom fields relevantes para el formulario (filtrado para no sobrecargar la IA)
      custom_fields: (clickupTask.custom_fields ?? [])
        .filter((cf) =>
          RELEVANT_CF_PATTERNS.some((p) => p.test(cf.name.trim())),
        )
        .map((cf) => ({
          name: sanitizeForPrompt(cf.name, 50),
          value: sanitizeForPrompt(resolveCustomFieldValue(cf), 150),
        }))
        .filter((cf) => cf.value !== "")
        .slice(0, 10),
      // Valores ya resueltos server-side (alta confianza)
      pre_resolved: {
        status: preResolvedStatus,
        squad: preResolvedSquad,
        // Si se resolvió el squad, el product_type se deriva de ese squad (más confiable que el cliente del task)
        product_type: preResolvedProductType,
        assigned_qa: preResolvedQA.length > 0 ? preResolvedQA : null,
      },
    };

    const catalogContext = {
      // (paso 9 del flujo)
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

    // 10. Llamar a OpenAI con response_format json_object
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
  "squads": Array<{ "squad": string, "low_returns": 0, "medium_returns": 0, "high_returns": 0 }> | null,
  "assigned_qa": string[] | null
}

Reglas estrictas:
- name: usa el nombre exacto de la tarea de ClickUp.
- product_type: busca primero en custom_fields el campo "Cliente" o "Proyecto" o "Producto". Si encuentra un valor, mapéalo al catálogo de products. Si no, intenta inferir del nombre/descripción. DEBE ser exactamente uno de los valores de catalog.products, o null.
- project_type: busca primero en custom_fields el campo "Tipo Proyecto" o "Tipo de Proyecto" o "Project Type". Si el valor coincide o se parece a algún valor del catálogo, úsalo. DEBE ser exactamente uno de los valores de catalog.project_types, o null.
- tshirt_size: busca primero en custom_fields el campo "Talla" o "Size" o "T-shirt" o "Complejidad". El valor puede ser una letra (XS, S, M, L, XL) o un nombre completo. Búscalo en catalog.complexities por coincidencia exacta o insensible a mayúsculas. DEBE ser exactamente uno de los valores de catalog.complexities, o null.
- status: IMPORTANTE — si "pre_resolved.status" en los datos NO es null, úsalo directamente sin cambiar. Si es null, dedúcelo: "Completada" si el estado es closed/done/complete, "Deprecada" si es cancelado/deprecated, "Pendiente" para cualquier otro estado activo.
- month y year: SIEMPRE null — no infieras estas fechas, el usuario las ingresa manualmente.
- effort_score_date: SIEMPRE null — no infieras esta fecha, el usuario la ingresa manualmente.
- squads: si "pre_resolved.squad" en los datos NO es null, úsalo directamente. Si es null, busca en custom_fields el campo "Equipo" y haz matching parcial por número y producto contra catalog.squads. Si no hay dato, null. Los returns siempre son 0.
- assigned_qa: si "pre_resolved.assigned_qa" en los datos NO es null, úsalos directamente. Si es null, intenta match por nombre similar en assignee_usernames contra catalog.qa_members. Solo nombres exactos del catálogo.
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

    // 11. Parsear y validar contra catálogos (descartar valores inválidos)
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
      // month, year y effort_score_date siempre null — el usuario los ingresa manualmente
      month: null,
      year: null,
      effort_score_date: null,
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

    // 12. Override con pre-resoluciones server-side (más confiables que la IA)
    if (preResolvedStatus !== null) {
      suggestions.status = preResolvedStatus;
    }
    if (preResolvedProductType !== null) {
      // El product_type del squad es más correcto que lo que infiere la IA del cliente del task
      suggestions.product_type = productNames.includes(preResolvedProductType)
        ? preResolvedProductType
        : suggestions.product_type;
    }
    if (preResolvedSquad !== null) {
      suggestions.squads = [
        {
          squad: preResolvedSquad,
          low_returns: 0,
          medium_returns: 0,
          high_returns: 0,
        },
      ];
    }
    if (preResolvedQA.length > 0) {
      suggestions.assigned_qa = preResolvedQA;
    }

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
