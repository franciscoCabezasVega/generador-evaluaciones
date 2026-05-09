import { NextRequest, NextResponse } from "next/server";
import { createFeedbackReport } from "@/lib/services/feedbackService";
import { FeedbackType } from "@/lib/types";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const { type, description, evidence_url } = body;

    // Validate type
    if (!["suggestion", "incident"].includes(type)) {
      return NextResponse.json(
        { message: "Tipo de reporte inválido" },
        { status: 400 },
      );
    }

    // Validate description
    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { message: "La descripción debe tener al menos 10 caracteres" },
        { status: 400 },
      );
    }

    // Validate evidence URL if provided
    if (evidence_url && evidence_url.trim()) {
      try {
        const url = new URL(evidence_url);
        if (!url.hostname.includes("jam.dev")) {
          return NextResponse.json(
            { message: "El enlace debe ser de jam.dev" },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { message: "El enlace no es una URL válida" },
          { status: 400 },
        );
      }
    }

    // Create feedback report
    const result = await createFeedbackReport({
      type: type as FeedbackType,
      description: description.trim(),
      evidence_url: evidence_url?.trim() || undefined,
    });

    return NextResponse.json(
      {
        message: "Reporte enviado correctamente",
        data: result,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Feedback API Error:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
