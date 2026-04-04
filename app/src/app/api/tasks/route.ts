import { NextRequest, NextResponse } from 'next/server';
import { CreateTaskInput } from '@/lib/types';
import { calculateTaskScore, validateReturns } from '@/lib/scoreCalculator';
import { getAuthContext } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !['admin', 'gestor'].includes(userRole)) {
      return NextResponse.json(
        { error: 'You do not have permission to create tasks' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateTaskInput;

    // Validaciones
    if (!body.name?.trim() || !body.task_link?.trim() || !body.product_type || !body.squads || body.squads.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields or empty squads array' },
        { status: 400 }
      );
    }

    // Validar campos obligatorios nuevos
    if (!body.assigned_qa || !Array.isArray(body.assigned_qa) || body.assigned_qa.length === 0) {
      return NextResponse.json(
        { error: 'Debe asignar al menos un QA' },
        { status: 400 }
      );
    }

    if (!body.effort_score_date) {
      return NextResponse.json(
        { error: 'La fecha de puntuación de esfuerzo es requerida' },
        { status: 400 }
      );
    }

    if (!body.tshirt_size) {
      return NextResponse.json(
        { error: 'La complejidad es requerida' },
        { status: 400 }
      );
    }

    // Validar complejidad y categoría en paralelo
    const [{ data: complexityExists }, { data: categoryExists }] = await Promise.all([
      supabase
        .from('complexities')
        .select('id')
        .eq('name', body.tshirt_size)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('categories')
        .select('id')
        .eq('name', body.category)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (!complexityExists) {
      return NextResponse.json(
        { error: 'Complejidad inválida' },
        { status: 400 }
      );
    }

    if (!categoryExists) {
      return NextResponse.json(
        { error: 'Categoría inválida' },
        { status: 400 }
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
          { status: 400 }
        );
      }
    }

    // Verificar si ya existe una tarea con el mismo link
    const { data: existingTask, error: checkError } = await supabase
      .from('tasks')
      .select('id')
      .eq('task_link', body.task_link)
      .single();

    if (existingTask) {
      return NextResponse.json(
        { error: 'Este link ya existe en otra tarea. Usa un link diferente.' },
        { status: 409 }
      );
    }

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for duplicates:', checkError);
    }

    // Crear tarea sin los campos de devoluciones (se guardan por squad)
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        name: body.name,
        task_link: body.task_link,
        product_type: body.product_type,
        status: body.status,
        month: body.month,
        year: body.year,
        user_id: user.id,
        assigned_qa: Array.isArray(body.assigned_qa) ? body.assigned_qa : [],
        effort_score_date: body.effort_score_date,
        tshirt_size: body.tshirt_size,
        category: body.category,
      })
      .select()
      .single();

    if (taskError) {
      if (taskError.code === '23505') {
        return NextResponse.json(
          { error: 'Este link ya existe en otra tarea. Usa un link diferente.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Error al crear la tarea' }, { status: 400 });
    }

    // Crear registros en task_squad para cada squad
    const taskSquadRecords = body.squads.map((squadData) => {
      const calculatedScore = calculateTaskScore({
        lowReturns: squadData.low_returns,
        mediumReturns: squadData.medium_returns,
        highReturns: squadData.high_returns,
      });

      return {
        task_id: task.id,
        squad: squadData.squad,
        low_returns: squadData.low_returns,
        medium_returns: squadData.medium_returns,
        high_returns: squadData.high_returns,
        calculated_score: calculatedScore,
        additional_notes: squadData.additional_notes || '',
      };
    });

    const { error: squadError } = await supabase
      .from('task_squad')
      .insert(taskSquadRecords);

    if (squadError) {
      // Si falla insertar los squads, eliminar la tarea
      await supabase.from('tasks').delete().eq('id', task.id);
      return NextResponse.json(
        { error: 'Error creating task squads: ' + squadError.message },
        { status: 400 }
      );
    }

    // Register audit log
    const userEmail = user.email || 'unknown';
    
    try {
      await supabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          user_email: userEmail,
          action: 'CREATE',
          entity_type: 'TASK',
          entity_id: task.id,
          entity_name: task.name,
          new_values: { ...task, squads: taskSquadRecords },
          timestamp: new Date().toISOString(),
        });
    } catch (auditError) {
      console.error('Error logging audit action:', auditError);
    }

    return NextResponse.json({ ...task, squads: taskSquadRecords }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
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
    const { user, supabase } = authCtx;

    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const productType = searchParams.get('product_type');
    const status = searchParams.get('status');

    // Obtener tareas del usuario
    let tasksQuery = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id);

    if (month) {
      tasksQuery = tasksQuery.eq('month', parseInt(month));
    }
    if (year) {
      tasksQuery = tasksQuery.eq('year', parseInt(year));
    }
    if (productType) {
      tasksQuery = tasksQuery.eq('product_type', productType);
    }
    if (status) {
      tasksQuery = tasksQuery.eq('status', status);
    }

    const { data: tasks, error: tasksError } = await tasksQuery.order('created_at', {
      ascending: false,
    });

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json({ error: 'Error al obtener tareas' }, { status: 400 });
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json([]);
    }

    // Obtener los squads asociados a cada tarea
    const taskIds = tasks.map(task => task.id);
    const { data: squadsData, error: squadsError } = await supabase
      .from('task_squad')
      .select('*')
      .in('task_id', taskIds);

    if (squadsError && squadsError.code !== 'PGRST116') {
      console.error('Error fetching squad data:', squadsError);
    }

    // Mapear squads a tareas
    const tasksWithSquads = tasks.map(task => ({
      ...task,
      squads: squadsData?.filter(squad => squad.task_id === task.id) || [],
    }));

    return NextResponse.json(tasksWithSquads);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
