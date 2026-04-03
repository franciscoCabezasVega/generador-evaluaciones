import { NextRequest, NextResponse } from 'next/server';
import { CreateReportInput } from '@/lib/types';
import { getAuthContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !['admin', 'reportero'].includes(userRole)) {
      return NextResponse.json(
        { error: 'You do not have permission to create reports' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateReportInput;

    if (!body.squad || !body.month || !body.year) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Obtener última versión
    const { data: lastReport } = await supabase
      .from('reports')
      .select('version')
      .eq('squad', body.squad)
      .eq('month', body.month)
      .eq('year', body.year)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (lastReport?.version || 0) + 1;

    // Whitelist: solo campos permitidos (prevenir mass assignment)
    const { data, error } = await supabase
      .from('reports')
      .insert({
        squad: body.squad,
        month: body.month,
        year: body.year,
        performance_comment: body.performance_comment || null,
        communication_comment: body.communication_comment || null,
        report_data: body.report_data || {},
        version: nextVersion,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting report:', error);
      return NextResponse.json({ error: 'Error al crear el reporte' }, { status: 400 });
    }

    // Register audit log for creation
    const userEmail = user.email || 'unknown';
    const reportName = `${body.squad} - ${body.month}/${body.year} v${nextVersion}`;
    
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          user_email: userEmail,
          action: 'CREATE',
          entity_type: 'REPORT',
          entity_id: data.id,
          entity_name: reportName,
          timestamp: new Date().toISOString(),
        });
    } catch (auditError) {
      console.error('Error logging audit action:', auditError);
      // No fallar la solicitud si el audit falla
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Obtener usuario y cliente autenticado
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { supabase } = authCtx;

    const searchParams = request.nextUrl.searchParams;
    const squad = searchParams.get('squad');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    let query = supabase.from('reports').select('*');

    if (squad) {
      query = query.eq('squad', squad);
    }
    if (month) {
      query = query.eq('month', parseInt(month));
    }
    if (year) {
      query = query.eq('year', parseInt(year));
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      console.error('Error fetching reports:', error);
      return NextResponse.json({ error: 'Error al obtener reportes' }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
