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
    const { filename, content_type } = body;

    if (!filename || !filename.trim()) {
      return NextResponse.json(
        { message: 'filename is required' },
        { status: 400 }
      );
    }

    const path = `prescriptions/${user.id}/${Date.now()}_${filename.trim()}`;

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase.storage
      .from('prescriptions')
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json(
        { message: error?.message || 'Failed to create signed upload URL' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        upload_url: data.signedUrl,
        token: data.token,
        path,
        content_type: content_type ?? null,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
