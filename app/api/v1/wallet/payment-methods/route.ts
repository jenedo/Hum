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
      .from('payment_methods')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch payment methods' },
        { status: 400 }
      );
    }

    return NextResponse.json({ payment_methods: data ?? [] }, { status: 200 });
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
    const { type, details } = body;

    if (!type || !type.trim()) {
      return NextResponse.json(
        { message: 'Payment method type is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: user.id,
        type: type.trim(),
        details: details || {},
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to add payment method' },
        { status: 400 }
      );
    }

    return NextResponse.json({ payment_method: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
