import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { appointment_time } = body;

    if (!appointment_time) {
      return NextResponse.json(
        { message: 'appointment_time is required' },
        { status: 400 }
      );
    }

    const parsedDate = new Date(appointment_time);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { message: 'appointment_time must be a valid ISO-8601 date string' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('appointments')
      .update({ appointment_time: parsedDate.toISOString(), status: 'scheduled' })
      .eq('id', params.id)
      .eq('patient_id', user.id)
      .neq('status', 'completed')
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: 'Appointment not found or cannot be rescheduled' },
        { status: 404 }
      );
    }

    return NextResponse.json({ appointment: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
