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
      .from('pharmacy_cart')
      .select('*, pharmacy_cart_items(*, pharmacy_products(*))')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch cart' },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({ cart: { items: [] } }, { status: 200 });
    }

    return NextResponse.json({ cart: data }, { status: 200 });
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
    const { product_id, quantity } = body;

    if (!product_id) {
      return NextResponse.json(
        { message: 'product_id is required' },
        { status: 400 }
      );
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      return NextResponse.json(
        { message: 'quantity must be a positive integer' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Upsert cart row (get or create)
    const { data: existingCart } = await supabase
      .from('pharmacy_cart')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    let cartId: string;

    if (existingCart) {
      cartId = existingCart.id;
    } else {
      const { data: newCart, error: cartError } = await supabase
        .from('pharmacy_cart')
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (cartError || !newCart) {
        return NextResponse.json(
          { message: cartError?.message || 'Failed to create cart' },
          { status: 400 }
        );
      }
      cartId = newCart.id;
    }

    // Try upsert first (ON CONFLICT cart_id, product_id), fall back to regular insert
    let cartItemData;
    const { data: upsertData, error: upsertError } = await supabase
      .from('pharmacy_cart_items')
      .upsert(
        { cart_id: cartId, product_id, quantity: parsedQty },
        { onConflict: 'cart_id,product_id', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (upsertError) {
      // Fallback: plain insert if UNIQUE constraint doesn't exist
      const { data: insertData, error: insertError } = await supabase
        .from('pharmacy_cart_items')
        .insert({ cart_id: cartId, product_id, quantity: parsedQty })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { message: insertError.message || 'Failed to add item to cart' },
          { status: 400 }
        );
      }
      cartItemData = insertData;
    } else {
      cartItemData = upsertData;
    }

    return NextResponse.json({ cart_item: cartItemData }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const supabase = getAdminSupabaseClient();

    const { data: cart } = await supabase
      .from('pharmacy_cart')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const { error } = await supabase
      .from('pharmacy_cart_items')
      .delete()
      .eq('cart_id', cart.id);

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to clear cart' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
