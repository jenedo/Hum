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
      .from('wallets')
      .select('*, wallet_transactions(*)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch wallet' },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({
        wallet: { balance_minor: 0, transactions: [] },
      }, { status: 200 });
    }

    return NextResponse.json({
      wallet: {
        ...data,
        transactions: data.wallet_transactions ?? [],
      },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
