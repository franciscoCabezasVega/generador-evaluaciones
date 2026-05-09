import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type') as 'TASK' | 'REPORT' | null;
    const entityId = searchParams.get('entity_id');
    const userId = searchParams.get('user_id');
    const action = searchParams.get('action') as 'CREATE' | 'UPDATE' | 'DELETE' | null;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0') || 0, 0);

    // Build query
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'planned' });

    // Admins can see all audit logs, others can only see their own
    if (userRole !== 'admin') {
      query = query.eq('user_id', user.id);
    } else if (userId) {
      // If admin specified a user_id filter, apply it
      query = query.eq('user_id', userId);
    }

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (entityId) {
      query = query.eq('entity_id', entityId);
    }
    if (action) {
      query = query.eq('action', action);
    }

    query = query.order('timestamp', { ascending: false });
    
    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching audit logs:', error);
      return NextResponse.json({ error: 'Error al obtener registros de auditoría' }, { status: 400 });
    }

    return NextResponse.json(
      {
        data: data || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          pages: Math.ceil((count || 0) / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
