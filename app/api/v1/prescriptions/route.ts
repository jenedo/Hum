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

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('prescriptions')
      .select('id, patient_id, doctor_id, file_url, notes, status, created_at, updated_at')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch prescriptions' },
        { status: 400 }
      );
    }

    return NextResponse.json({ prescriptions: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

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
    const { file_url, notes, doctor_id } = body;

    if (!file_url || !file_url.trim()) {
      return NextResponse.json(
        { message: 'file_url is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        patient_id: user.id,
        doctor_id: doctor_id ?? null,
        file_url: file_url.trim(),
        notes: notes ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to create prescription' },
        { status: 400 }
      );
    }

    return NextResponse.json({ prescription: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
