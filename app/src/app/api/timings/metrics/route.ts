import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { timingService } from '@/lib/services/timingService';

/**
 * GET /api/timings/metrics
 * Obtener métricas de tiempos agrupadas por product_type
 * Query params: month, year, product_type
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extraer token del header Authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.substring('Bearer '.length);

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const product_type = searchParams.get('product_type') || undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;

    // Require either date range or month+year
    if (!startDate && (!month || !year)) {
      return NextResponse.json(
        { error: 'Either start_date/end_date or month/year parameters are required' },
        { status: 400 }
      );
    }

    // Metrics request logged for debugging
    void month; // params already validated above

    const metrics = await timingService.getSquadTimingMetrics({
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      startDate,
      endDate,
      product_type,
    }, token);

    return NextResponse.json(metrics, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/timings/metrics:', error);
    return NextResponse.json(
      { error: 'Error al obtener métricas' },
      { status: 500 }
    );
  }
}
