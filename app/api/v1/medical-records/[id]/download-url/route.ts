import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json({ message: authError || 'Unauthorized access' }, { status: 401 });
    }

    const supabase = getAdminSupabaseClient();

    const { data: record, error: fetchError } = await supabase
      .from('medical_records')
      .select('id, file_url')
      .eq('id', params.id)
      .eq('patient_id', user.id)
      .maybeSingle();

    if (fetchError || !record) {
      return NextResponse.json({ message: 'Medical record not found' }, { status: 404 });
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from('medical-records')
      .createSignedUrl(record.file_url, 3600);

    if (signError || !signedData) {
      return NextResponse.json({ message: signError?.message || 'Failed to generate download URL' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return NextResponse.json({
      downloadUrl: signedData.signedUrl,
      expiresAt,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
