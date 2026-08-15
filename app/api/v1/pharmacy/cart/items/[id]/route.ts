import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsedQty = parseInt(body.quantity, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      return NextResponse.json(
        { message: 'quantity must be a positive integer' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Verify the item belongs to user's cart
    const { data: cart } = await supabase
      .from('pharmacy_cart')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      return NextResponse.json(
        { message: 'Cart item not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from('pharmacy_cart_items')
      .update({ quantity: parsedQty })
      .eq('id', params.id)
      .eq('cart_id', cart.id)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: 'Cart item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ cart_item: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Verify item belongs to user's cart
    const { data: cart } = await supabase
      .from('pharmacy_cart')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      return NextResponse.json(
        { message: 'Cart item not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from('pharmacy_cart_items')
      .delete()
      .eq('id', params.id)
      .eq('cart_id', cart.id)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: 'Cart item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
