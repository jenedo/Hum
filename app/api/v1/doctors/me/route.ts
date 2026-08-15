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
      .from('doctors')
      .select('*, profiles(full_name, avatar_url, email, phone)')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch doctor profile' },
        { status: 400 }
      );
    }

    return NextResponse.json({ doctor: data }, { status: 200 });
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
    const { specialization, qualification, experience_years, consultation_fee_minor } = body;

    const updates: Record<string, unknown> = {};
    if (specialization !== undefined) updates.specialization = specialization;
    if (qualification !== undefined) updates.qualification = qualification;
    if (experience_years !== undefined) updates.experience_years = experience_years;
    if (consultation_fee_minor !== undefined) updates.consultation_fee_minor = consultation_fee_minor;

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('doctors')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to update doctor profile' },
        { status: 400 }
      );
    }

    return NextResponse.json({ doctor: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
