import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserFromRequest } from "@/lib/auth";

/**
 * Sanitizar texto de usuario antes de inyectarlo en prompts de IA.
 * Previene prompt injection removiendo patrones peligrosos.
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return "";
  return text
    .replace(/```/g, "") // Remover bloques de código
    .replace(/\bignore\b.*\binstructions\b/gi, "[filtered]")
    .replace(/\bforget\b.*\babove\b/gi, "[filtered]")
    .replace(/\bsystem\b.*\bprompt\b/gi, "[filtered]")
    .replace(/\brole\b.*\bassistant\b/gi, "[filtered]")
    .slice(0, 500); // Limitar longitud
}

export async function POST(request: NextRequest) {
  try {
    // Verificar que la API key esté disponible
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY no está configurada");
      return NextResponse.json(
        { error: "API key de OpenAI no configurada" },
        { status: 500 },
      );
    }

    // Verificar autenticación
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { squadName, tasks, type } = await request.json();

    if (!squadName || !tasks || !type) {
      return NextResponse.json(
        { error: "Missing required fields: squadName, tasks, type" },
        { status: 400 },
      );
    }

    // Inicializar cliente OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const taskSummary = tasks
      .map(
        (t: {
          name?: string;
          calculated_score?: number;
          high_returns?: number;
          medium_returns?: number;
          low_returns?: number;
          additional_notes?: string;
        }) => `
      - ${sanitizeForPrompt(String(t.name || ""))}
      - Puntuación: ${Number(t.calculated_score) || 0}/10
      - Devoluciones graves: ${Number(t.high_returns) || 0}
      - Devoluciones medias: ${Number(t.medium_returns) || 0}
      - Devoluciones bajas: ${Number(t.low_returns) || 0}
      - Notas: ${sanitizeForPrompt(String(t.additional_notes || "N/A"))}
    `,
      )
      .join("\n");

    const prompt =
      type === "performance"
        ? `Genera un comentario profesional y conciso (máximo 100 palabras) sobre el desempeño del equipo basado en estos datos de tareas:
${taskSummary}

Enfócate en los logros, productividad, calidad del trabajo, entregables y cumplimiento de objetivos. Evita ser genérico. Ejemplo esperado: "El equipo presentó un desempeño excelente, con entregables de alta calidad y cumplimiento total de los objetivos. Los features fueron desarrollados sin devoluciones relevantes, evidenciando solidez técnica, buen entendimiento de los requerimientos y consistencia en los resultados."`
        : `Genera un comentario profesional y conciso (máximo 100 palabras) sobre la comunicación del equipo con QA basado en estos datos de tareas:
${taskSummary}

Evalúa la claridad en la documentación, atención a observaciones del QA, actitud colaborativa, fluidez en el seguimiento y alineación con objetivos. Evita ser genérico. Ejemplo esperado: "La comunicación fue clara y fluida durante todo el proceso, permitiendo un seguimiento efectivo y una rápida atención a observaciones puntuales. El equipo mantuvo una actitud colaborativa y alineada con los objetivos del proyecto."`;
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const comment =
      response.choices[0]?.message?.content || "No se pudo generar comentario";

    return NextResponse.json({ comment });
  } catch (error: unknown) {
    console.error("Error generando comentario IA:", error);
    return NextResponse.json(
      { error: "Error al generar comentario de IA" },
      { status: 500 },
    );
  }
}
