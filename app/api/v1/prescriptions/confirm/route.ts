import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { path, notes, doctor_id } = body;

    if (!path || !path.trim()) {
      return NextResponse.json(
        { message: 'path is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        patient_id: user.id,
        file_url: path.trim(),
        notes: notes ?? null,
        doctor_id: doctor_id ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to save prescription' },
        { status: 400 }
      );
    }

    return NextResponse.json({ prescription: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
