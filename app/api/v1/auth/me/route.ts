import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { user, error } = await verifyAuthToken(request);

    if (error || !user) {
      return NextResponse.json(
        { message: error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      data: {
        user: {
          id: profile?.id || user.id,
          email: user.email,
          fullName: profile?.full_name || user.user_metadata?.full_name || '',
          role: profile?.role || 'patient',
          avatarUrl: profile?.avatar_url || null,
          phone: profile?.phone || null,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
