import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('doctors')
      .select('*, profiles!inner(full_name, avatar_url, email, phone)')
      .eq('id', params.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ message: 'Doctor not found' }, { status: 404 });
    }

    return NextResponse.json({ doctor: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
