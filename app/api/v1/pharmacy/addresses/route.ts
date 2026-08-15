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
      .from('delivery_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch addresses' },
        { status: 400 }
      );
    }

    return NextResponse.json({ addresses: data ?? [] }, { status: 200 });
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
    const { label, address_line, city } = body;

    if (!label || !label.trim()) {
      return NextResponse.json(
        { message: 'label is required' },
        { status: 400 }
      );
    }

    if (!address_line || !address_line.trim()) {
      return NextResponse.json(
        { message: 'address_line is required' },
        { status: 400 }
      );
    }

    if (!city || !city.trim()) {
      return NextResponse.json(
        { message: 'city is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('delivery_addresses')
      .insert({
        user_id: user.id,
        label: label.trim(),
        address_line: address_line.trim(),
        city: city.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to add address' },
        { status: 400 }
      );
    }

    return NextResponse.json({ address: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
