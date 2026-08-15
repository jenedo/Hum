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

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*, wallets(balance_minor)')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch patient profile' },
        { status: 400 }
      );
    }

    // Flatten wallet balance into top-level field
    const patient = data
      ? {
          ...data,
          balance_minor: (data.wallets as { balance_minor: number } | null)?.balance_minor ?? 0,
          wallets: undefined,
        }
      : null;

    return NextResponse.json({ patient }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { full_name, phone, avatar_url } = body;

    const updates: Record<string, unknown> = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (phone !== undefined) updates.phone = phone;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to update patient profile' },
        { status: 400 }
      );
    }

    return NextResponse.json({ patient: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
