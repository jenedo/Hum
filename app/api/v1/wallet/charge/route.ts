import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { amount_minor, description } = body;

    if (!amount_minor || amount_minor <= 0) {
      return NextResponse.json(
        { message: 'amount_minor must be greater than 0' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balance_minor')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { message: 'Wallet not found' },
        { status: 404 }
      );
    }

    if (wallet.balance_minor < amount_minor) {
      return NextResponse.json(
        { message: 'Insufficient funds' },
        { status: 400 }
      );
    }

    const { error: txErr } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: wallet.id,
        amount_minor,
        type: 'debit',
        description: description ?? 'Charge',
      });

    if (txErr) {
      return NextResponse.json(
        { message: txErr.message || 'Failed to record debit transaction' },
        { status: 400 }
      );
    }

    const new_balance = wallet.balance_minor - amount_minor;

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({ balance_minor: new_balance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (updateErr) {
      return NextResponse.json(
        { message: updateErr.message || 'Failed to update wallet balance' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      new_balance_minor: new_balance,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
