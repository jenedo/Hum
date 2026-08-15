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

    // Get or create wallet
    let { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance_minor')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wallet) {
      const { data: createdWallet, error: createErr } = await supabase
        .from('wallets')
        .insert({ user_id: user.id, balance_minor: 0 })
        .select('id, balance_minor')
        .single();

      if (createErr || !createdWallet) {
        return NextResponse.json(
          { message: createErr?.message || 'Failed to initialize wallet' },
          { status: 400 }
        );
      }
      wallet = createdWallet;
    }

    const new_balance = wallet.balance_minor + amount_minor;

    const { error: txErr } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: wallet.id,
        amount_minor,
        type: 'credit',
        description: description ?? 'Refund',
      });

    if (txErr) {
      return NextResponse.json(
        { message: txErr.message || 'Failed to record refund transaction' },
        { status: 400 }
      );
    }

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
