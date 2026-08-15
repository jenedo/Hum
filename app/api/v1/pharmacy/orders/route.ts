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
      .from('pharmacy_orders')
      .select('*, pharmacy_order_items(*)')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch orders' },
        { status: 400 }
      );
    }

    return NextResponse.json({ orders: data ?? [] }, { status: 200 });
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
    const { items, delivery_address, total_amount_minor } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: 'items array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!delivery_address) {
      return NextResponse.json(
        { message: 'delivery_address is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from('pharmacy_orders')
      .insert({
        patient_id: user.id,
        status: 'pending',
        total_amount_minor: total_amount_minor ?? 0,
        delivery_address,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { message: orderError?.message || 'Failed to create order' },
        { status: 400 }
      );
    }

    // Insert order items
    const orderItems = items.map((item: { product_id: string; quantity: number; price_minor?: number }) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      price_minor: item.price_minor ?? 0,
    }));

    const { error: itemsError } = await supabase
      .from('pharmacy_order_items')
      .insert(orderItems);

    if (itemsError) {
      return NextResponse.json(
        { message: itemsError.message || 'Failed to create order items' },
        { status: 400 }
      );
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
