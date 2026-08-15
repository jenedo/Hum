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
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const supabase = getAdminSupabaseClient();

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch notifications' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { notifications: data ?? [], unread_count: count ?? 0 },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
