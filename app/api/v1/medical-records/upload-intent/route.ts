import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json({ message: authError || 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mimeType, sizeBytes, purpose } = body;

    if (!mimeType) {
      return NextResponse.json({ message: 'mimeType is required' }, { status: 400 });
    }

    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const normalizedMime = mimeType.trim().toLowerCase();
    if (!allowedMimeTypes.includes(normalizedMime)) {
      return NextResponse.json({ message: `Unsupported MIME type: ${mimeType}` }, { status: 400 });
    }

    const maxSize = 5242880;
    if (sizeBytes && sizeBytes > maxSize) {
      return NextResponse.json({ message: `File exceeds 5 MiB limit` }, { status: 400 });
    }

    const storedObjectId = randomUUID();
    const ext = normalizedMime === 'application/pdf' ? 'pdf' : normalizedMime === 'image/png' ? 'png' : 'jpg';
    const objectPath = `${user.id}/${storedObjectId}.${ext}`;
    const bucket = 'medical-records';

    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(objectPath);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    // Save to stored_objects so confirm route can look it up
    await supabase.from('stored_objects').insert({
      id: storedObjectId,
      user_id: user.id,
      bucket,
      object_path: objectPath,
      filename: `${purpose ?? 'medical-record'}.${ext}`,
      content_type: normalizedMime,
      size_bytes: sizeBytes ?? null,
    });

    const uploadExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return NextResponse.json({
      data: {
        storedObjectId,
        bucket,
        objectPath,
        uploadUrl: data.signedUrl,
        uploadExpiresAt,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
