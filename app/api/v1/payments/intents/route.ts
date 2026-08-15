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
    const { amount_minor, gateway, metadata } = body;

    if (!amount_minor || amount_minor <= 0) {
      return NextResponse.json(
        { message: 'amount_minor must be a positive number' },
        { status: 400 }
      );
    }

    if (!gateway) {
      return NextResponse.json(
        { message: 'gateway is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('payment_intents')
      .insert({
        user_id: user.id,
        amount_minor,
        currency: 'PKR',
        status: 'pending',
        gateway,
        metadata: metadata ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to create payment intent' },
        { status: 400 }
      );
    }

    return NextResponse.json({ payment_intent: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

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
      .from('payment_intents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch payment intents' },
        { status: 400 }
      );
    }

    return NextResponse.json({ payment_intents: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
