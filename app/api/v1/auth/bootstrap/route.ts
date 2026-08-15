import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { user, error } = await verifyAuthToken(request);

    if (error || !user) {
      return NextResponse.json(
        { message: error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { role, fullName } = body;

    // Normalize role to match PostgreSQL user_role enum ('patient', 'doctor', 'admin')
    const rawRole = (role || 'patient').toString().toLowerCase();
    const validRoles = ['patient', 'doctor', 'admin'];
    const dbRole = validRoles.includes(rawRole) ? rawRole : 'patient';

    const supabase = getAdminSupabaseClient();

    // Upsert the application profile with valid lowercase dbRole
    const { data: profile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName || '',
        role: dbRole,
        email: user.email!,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (upsertError) {
      return NextResponse.json(
        { message: upsertError.message || 'Failed to bootstrap profile.' },
        { status: 400 }
      );
    }

    // Ensure wallet exists (Idempotent)
    await supabase
      .from('wallets')
      .upsert({ user_id: user.id, balance_minor: 0 }, { onConflict: 'user_id' });

    return NextResponse.json({
      data: {
        user: {
          id: profile.id,
          email: profile.email || user.email,
          fullName: profile.full_name || fullName || '',
          role: profile.role || dbRole,
          avatarUrl: profile.avatar_url || null,
          phone: profile.phone || null,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
