import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { role, supabase } = authCtx;

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden gestionar catálogos' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
    }
    const name = body.name.trim();
    const { data: existing } = await supabase
      .from('qa_members')
      .select('id')
      .ilike('name', name)
      .neq('id', id)
      .single();
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un miembro QA con ese nombre' }, { status: 409 });
    }
    updates.name = name;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('qa_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating QA member:', error);
    return NextResponse.json({ error: 'Error al actualizar miembro QA' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { role, supabase } = authCtx;

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden gestionar catálogos' }, { status: 403 });
  }

  const { id } = await params;

  const { data: member } = await supabase
    .from('qa_members')
    .select('name')
    .eq('id', id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Miembro QA no encontrado' }, { status: 404 });
  }

  const { count } = await supabase
    .from('task_qa')
    .select('id', { count: 'exact', head: true })
    .eq('qa_name', member.name);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: hay ${count} tarea(s) asignadas a "${member.name}". Desactívalo en su lugar.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('qa_members').delete().eq('id', id);
  if (error) {
    console.error('Error deleting QA member:', error);
    return NextResponse.json({ error: 'Error al eliminar miembro QA' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
