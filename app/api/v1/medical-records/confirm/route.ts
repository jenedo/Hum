import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json({ message: authError || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storedObjectId, path, title, record_type, notes } = body;

    const supabase = getAdminSupabaseClient();

    let filePath = path?.trim();
    let fileTitle = title?.trim();
    let mimeType = 'application/pdf';
    let sizeBytes = 0;
    let bucket = 'medical-records';

    if (storedObjectId) {
      const { data: stored } = await supabase
        .from('stored_objects')
        .select('object_path, filename, content_type, size_bytes, bucket')
        .eq('id', storedObjectId)
        .eq('user_id', user.id)
        .single();

      if (stored) {
        filePath = filePath || stored.object_path;
        fileTitle = fileTitle || stored.filename || 'Medical Record';
        mimeType = stored.content_type || mimeType;
        sizeBytes = stored.size_bytes || sizeBytes;
        bucket = stored.bucket || bucket;
      }
    }

    if (!filePath) {
      return NextResponse.json({ message: 'path or storedObjectId is required' }, { status: 400 });
    }

    if (!fileTitle) {
      fileTitle = filePath.split('/').pop() ?? 'Medical Record';
    }

    const { data: record, error: recordError } = await supabase
      .from('medical_records')
      .insert({
        patient_id: user.id,
        file_url: filePath,
        title: fileTitle,
        record_type: record_type ?? 'MEDICAL_RECORD',
        notes: notes ?? null,
      })
      .select()
      .single();

    if (recordError) {
      return NextResponse.json({ message: recordError.message }, { status: 400 });
    }

    if (!storedObjectId) {
      await supabase.from('stored_objects').insert({
        user_id: user.id,
        bucket,
        object_path: filePath,
        filename: filePath.split('/').pop() ?? filePath,
        content_type: mimeType,
      });
    }

    // Return response matching Flutter MedicalRecordModel.fromJson()
    return NextResponse.json({
      data: {
        id: record.id,
        bucket,
        purpose: record.record_type ?? 'MEDICAL_RECORD',
        mimeType,
        sizeBytes,
        scanStatus: 'PASSED',
        isAvailable: true,
        createdAt: record.created_at,
        objectPath: filePath,
        confirmedAt: record.created_at,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
