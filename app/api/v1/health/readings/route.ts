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
    const type = searchParams.get('type')?.trim();

    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(100, rawLimit);

    const supabase = getAdminSupabaseClient();

    let query = supabase
      .from('health_readings')
      .select('*')
      .eq('patient_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch health readings' },
        { status: 400 }
      );
    }

    return NextResponse.json({ readings: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

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
    const { type, value, unit, notes, recorded_at } = body;

    if (!type || !String(type).trim()) {
      return NextResponse.json(
        { message: 'type is required' },
        { status: 400 }
      );
    }

    if (value === undefined || value === null) {
      return NextResponse.json(
        { message: 'value is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('health_readings')
      .insert({
        patient_id: user.id,
        type: String(type).trim(),
        value,
        unit: unit ?? null,
        notes: notes ?? null,
        recorded_at: recorded_at ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to save health reading' },
        { status: 400 }
      );
    }

    return NextResponse.json({ reading: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
