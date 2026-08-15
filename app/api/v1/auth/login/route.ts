import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Invalid credentials.' },
        { status: 401 }
      );
    }

    const user = data?.user;
    const token = data?.session?.access_token;

    if (!user || !token) {
      return NextResponse.json(
        { message: 'Authentication failed.' },
        { status: 401 }
      );
    }

    if (!data.user?.email_confirmed_at) {
      return NextResponse.json(
        { message: 'Please verify your email before signing in.' },
        { status: 403 }
      );
    }

    // Fetch application profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      token,
      id: user.id,
      email: user.email,
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
