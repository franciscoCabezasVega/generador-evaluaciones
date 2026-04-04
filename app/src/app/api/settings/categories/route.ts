import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { supabase } = authCtx;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('includeInactive') === 'true';

  let query = supabase.from('categories').select('*').order('name');
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { role, supabase } = authCtx;

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden gestionar catálogos' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  }
  const name = body.name.trim();

  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', name)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
