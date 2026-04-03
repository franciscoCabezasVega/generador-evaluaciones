import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getUserFromRequest } from '@/lib/auth';

const MAX_BATCH_SIZE = 12; // Máximo 6 squads x 2 tipos
const MAX_CONCURRENCY = 4;

/**
 * Sanitizar texto de usuario antes de inyectarlo en prompts de IA.
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return text
    .replace(/```/g, '')
    .replace(/\bignore\b.*\binstructions\b/gi, '[filtered]')
    .replace(/\bforget\b.*\babove\b/gi, '[filtered]')
    .replace(/\bsystem\b.*\bprompt\b/gi, '[filtered]')
    .replace(/\brole\b.*\bassistant\b/gi, '[filtered]')
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY no está configurada');
      return NextResponse.json(
        { error: 'API key de OpenAI no configurada' },
        { status: 500 }
      );
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parsear el body como JSON
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Error parsing request JSON:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { comments: commentsData } = body;

    // Validar que comments sea un array no vacío
    if (!commentsData) {
      console.error('No comments field in request');
      return NextResponse.json(
        { error: 'Missing required field: comments' },
        { status: 400 }
      );
    }

    if (!Array.isArray(commentsData)) {
      console.error('comments is not an array:', typeof commentsData);
      return NextResponse.json(
        { error: 'comments must be an array' },
        { status: 400 }
      );
    }

    // Si el array está vacío, retornar objeto vacío de comentarios
    if (commentsData.length === 0) {
      console.warn('comments array is empty, returning empty comments object');
      return NextResponse.json({ comments: {} });
    }

    // Limitar tamaño del batch para prevenir abuso
    if (commentsData.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }

    // Validar estructura de cada comentario
    for (let i = 0; i < commentsData.length; i++) {
      const { squadName, tasks, type } = commentsData[i];
      if (!squadName || !tasks || !type) {
        console.error(`Invalid comment structure at index ${i}:`, commentsData[i]);
        return NextResponse.json(
          { error: `Invalid comment structure at index ${i}: missing squadName, tasks, or type` },
          { status: 400 }
        );
      }
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Crear un batch de prompts
    const prompts = commentsData.map(({ tasks, type }) => {
      const taskSummary = tasks.map((t: { name?: string; calculated_score?: number; high_returns?: number; medium_returns?: number; low_returns?: number; additional_notes?: string }) => `
        - ${sanitizeForPrompt(String(t.name || ''))}
        - Puntuación: ${Number(t.calculated_score) || 0}/10
        - Devoluciones graves: ${Number(t.high_returns) || 0}
        - Devoluciones medias: ${Number(t.medium_returns) || 0}
        - Devoluciones bajas: ${Number(t.low_returns) || 0}
        - Notas: ${sanitizeForPrompt(String(t.additional_notes || 'N/A'))}
      `).join('\n');

      return type === 'performance'
        ? `Genera un comentario profesional y conciso (máximo 100 palabras) sobre el desempeño del equipo basado en estos datos de tareas:
${taskSummary}

Enfócate en los logros, productividad, calidad del trabajo, entregables y cumplimiento de objetivos. Evita ser genérico. Ejemplo esperado: "El equipo presentó un desempeño excelente, con entregables de alta calidad y cumplimiento total de los objetivos. Los features fueron desarrollados sin devoluciones relevantes, evidenciando solidez técnica, buen entendimiento de los requerimientos y consistencia en los resultados."`
        : `Genera un comentario profesional y conciso (máximo 100 palabras) sobre la comunicación del equipo con QA basado en estos datos de tareas:
${taskSummary}

Evalúa la claridad en la documentación, atención a observaciones del QA, actitud colaborativa, fluidez en el seguimiento y alineación con objetivos. Evita ser genérico. Ejemplo esperado: "La comunicación fue clara y fluida durante todo el proceso, permitiendo un seguimiento efectivo y una rápida atención a observaciones puntuales. El equipo mantuvo una actitud colaborativa y alineada con los objetivos del proyecto."`;
    });

    // Procesar comentarios con concurrencia limitada
    const comments: Record<string, string> = {};
    for (let i = 0; i < prompts.length; i += MAX_CONCURRENCY) {
      const batch = prompts.slice(i, i + MAX_CONCURRENCY);
      const batchResponses = await Promise.all(
        batch.map(prompt =>
          openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          })
        )
      );
      batchResponses.forEach((response, batchIndex) => {
        const globalIndex = i + batchIndex;
        const { squadName, type } = commentsData[globalIndex];
        const key = `${squadName}-${type}`;
        comments[key] = response.choices[0]?.message?.content || 'No se pudo generar comentario';
      });
    }

    return NextResponse.json({ comments });
  } catch (error: unknown) {
    console.error('Error generando comentarios IA:', error);
    return NextResponse.json(
      { error: 'Error al generar comentarios de IA' },
      { status: 500 }
    );
  }
}
