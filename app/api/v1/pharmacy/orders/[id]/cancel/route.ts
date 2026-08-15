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

    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('pharmacy_orders')
      .update({ status: 'cancelled' })
      .eq('id', params.id)
      .eq('patient_id', user.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: 'Order not found or cannot be cancelled' },
        { status: 404 }
      );
    }

    return NextResponse.json({ order: data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
