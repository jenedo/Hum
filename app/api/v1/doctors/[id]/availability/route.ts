import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date')?.trim();

    const supabase = getAdminSupabaseClient();
    let query = supabase
      .from('availability_slots')
      .select('*')
      .eq('doctor_id', params.id);

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`).toISOString();
      const endOfDay = new Date(`${date}T23:59:59.999Z`).toISOString();
      query = query.gte('start_time', startOfDay).lte('start_time', endOfDay);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { slots: [], message: error.message || 'Failed to fetch availability' },
        { status: 400 }
      );
    }

    return NextResponse.json({ slots: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ slots: [], message }, { status: 500 });
  }
}
