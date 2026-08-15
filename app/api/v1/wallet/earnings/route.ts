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

    // Get doctor's wallet first
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (walletError) {
      return NextResponse.json(
        { message: walletError.message || 'Failed to fetch wallet' },
        { status: 400 }
      );
    }

    if (!wallet) {
      return NextResponse.json(
        { earnings: [], total_minor: 0 },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .eq('type', 'credit')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch earnings' },
        { status: 400 }
      );
    }

    const earnings = data ?? [];
    const total_minor = earnings.reduce(
      (sum: number, tx: { amount_minor: number }) => sum + (tx.amount_minor ?? 0),
      0
    );

    return NextResponse.json({ earnings, total_minor }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
