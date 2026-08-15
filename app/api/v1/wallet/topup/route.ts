import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

interface TopUpPayload {
  amount_minor?: number;
  amount?: number;
  description?: string;
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

    const idempotencyKey =
      request.headers.get('x-idempotency-key') ||
      request.headers.get('idempotency-key');

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return NextResponse.json(
        { message: 'X-Idempotency-Key header is required' },
        { status: 400 }
      );
    }

    const body: TopUpPayload = await request.json();
    const amountMinor = Math.floor(body.amount_minor ?? body.amount ?? 0);

    if (amountMinor <= 0) {
      return NextResponse.json(
        { message: 'amount_minor must be a positive integer' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    // Check if key was already processed
    const { data: existingTx } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('idempotency_key', idempotencyKey.trim())
      .maybeSingle();

    if (existingTx) {
      return NextResponse.json(
        { transaction: existingTx, status: 'already_processed' },
        { status: 200 }
      );
    }

    // Get or Create User Wallet
    let { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wallet) {
      const { data: createdWallet, error: createErr } = await supabase
        .from('wallets')
        .insert({ user_id: user.id, balance_minor: 0 })
        .select()
        .single();

      if (createErr || !createdWallet) {
        return NextResponse.json(
          { message: createErr?.message || 'Failed to initialize user wallet' },
          { status: 500 }
        );
      }
      wallet = createdWallet;
    }

    const currentBalance = Number(wallet.balance_minor || 0);
    const newBalance = currentBalance + amountMinor;

    // Atomic update balance
    const { error: updateErr } = await supabase
      .from('wallets')
      .update({ balance_minor: newBalance, updated_at: new Date().toISOString() })
      .eq('id', wallet.id);

    if (updateErr) {
      return NextResponse.json(
        { message: updateErr.message || 'Failed to update wallet balance' },
        { status: 500 }
      );
    }

    // Create transaction log
    const { data: tx, error: txErr } = await supabase
      .from('wallet_transactions')
      .insert({
        wallet_id: wallet.id,
        idempotency_key: idempotencyKey.trim(),
        type: 'topup',
        amount_minor: amountMinor,
        description: body.description?.trim() || 'Wallet Balance Top-Up',
      })
      .select()
      .single();

    if (txErr) {
      return NextResponse.json(
        { message: txErr.message || 'Failed to record transaction' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { transaction: tx, balance_minor: newBalance },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
