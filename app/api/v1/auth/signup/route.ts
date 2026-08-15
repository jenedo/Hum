import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, fullName, role } = body;

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const rawRole = (role || 'patient').toString().toLowerCase();
    const validRoles = ['patient', 'doctor', 'admin'];
    const dbRole = validRoles.includes(rawRole) ? rawRole : 'patient';
    const cleanEmail = email.trim().toLowerCase();

    const supabase = getAdminSupabaseClient();

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName || '', role: dbRole },
    });

    if (authError) {
      const msg = authError.message ?? '';
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return NextResponse.json(
          { message: 'An account with this email already exists.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { message: msg || 'Registration failed.' },
        { status: 400 }
      );
    }

    const user = authData?.user;
    if (!user) {
      return NextResponse.json({ message: 'User creation failed.' }, { status: 500 });
    }

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: cleanEmail,
        full_name: fullName || '',
        role: dbRole,
      }, { onConflict: 'id' });

    if (profileError) {
      await supabase.auth.admin.deleteUser(user.id);
      return NextResponse.json(
        { message: `Profile creation failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // Create wallet
    await supabase
      .from('wallets')
      .upsert({ user_id: user.id, balance_minor: 0 }, { onConflict: 'user_id' });

    // Return user info — client calls /login separately
    return NextResponse.json({
      id: user.id,
      email: user.email,
      message: 'Account created successfully.',
    }, { status: 201 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
