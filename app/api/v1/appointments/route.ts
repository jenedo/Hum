import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim();

    const supabase = getAdminSupabaseClient();
    let query = supabase
      .from('appointments')
      .select('*, doctors(*, profiles(full_name, avatar_url))')
      .eq('patient_id', user.id)
      .order('appointment_time', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch appointments' },
        { status: 400 }
      );
    }

    return NextResponse.json({ appointments: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
