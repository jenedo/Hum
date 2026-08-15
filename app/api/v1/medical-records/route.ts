import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json({ message: authError || 'Unauthorized access' }, { status: 401 });
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('medical_records')
      .select('id, patient_id, title, record_type, file_url, notes, created_at, updated_at')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ message: error.message || 'Failed to fetch medical records' }, { status: 400 });
    }

    const mapped = (data ?? []).map((r) => ({
      id: r.id,
      bucket: 'medical-records',
      purpose: r.record_type ?? 'MEDICAL_RECORD',
      mimeType: 'application/pdf',
      sizeBytes: 0,
      scanStatus: 'PASSED',
      isAvailable: true,
      createdAt: r.created_at,
      objectPath: r.file_url ?? '',
      confirmedAt: r.created_at,
    }));

    return NextResponse.json({ data: mapped }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json({ message: authError || 'Unauthorized access' }, { status: 401 });
    }

    const body = await request.json();
    const { title, file_url, notes, record_type } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ message: 'title is required' }, { status: 400 });
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('medical_records')
      .insert({
        patient_id: user.id,
        title: title.trim(),
        file_url: file_url ?? null,
        notes: notes ?? null,
        record_type: record_type ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ message: error.message || 'Failed to create medical record' }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
