import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

async function handleCancelAppointment(
  request: Request,
  appointmentIdParam: string
) {
  try {
    const { user, error: authError } = await verifyAuthToken(request);
    if (authError || !user) {
      return NextResponse.json(
        { message: authError || 'Unauthorized access' },
        { status: 401 }
      );
    }

    const appointmentId = appointmentIdParam?.trim();
    if (!appointmentId) {
      return NextResponse.json(
        { message: 'Appointment ID is required' },
        { status: 400 }
      );
    }

    const idempotencyKey =
      request.headers.get('x-idempotency-key') ||
      request.headers.get('idempotency-key') ||
      `cancel-${appointmentId}`;

    const supabase = getAdminSupabaseClient();

    // 1. Fetch appointment details
    const { data: appointment, error: fetchErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (fetchErr || !appointment) {
      return NextResponse.json(
        { message: fetchErr?.message || 'Appointment not found' },
        { status: 404 }
      );
    }

    // 2. Authorization check: patient, doctor, or admin
    const isPatient = appointment.patient_id === user.id;
    const isDoctor = appointment.doctor_id === user.id;
    if (!isPatient && !isDoctor) {
      return NextResponse.json(
        { message: 'You do not have permission to cancel this appointment' },
        { status: 403 }
      );
    }

    // 3. Status check
    if (appointment.status === 'cancelled') {
      return NextResponse.json(
        { appointment, message: 'Appointment is already cancelled' },
        { status: 200 }
      );
    }

    if (appointment.status === 'completed') {
      return NextResponse.json(
        { message: 'Completed appointments cannot be cancelled' },
        { status: 400 }
      );
    }

    const refundAmountMinor = appointment.fee_minor || 0;
    let refundProcessed = false;
    let newBalanceMinor: number | null = null;

    // 4. Refund logic: Double-entry ledger wallet transaction
    if (refundAmountMinor > 0 && isPatient) {
      const { data: existingRefundTx } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (!existingRefundTx) {
        let { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', appointment.patient_id)
          .maybeSingle();

        if (!wallet) {
          const { data: createdWallet } = await supabase
            .from('wallets')
            .insert({ user_id: appointment.patient_id, balance_minor: 0 })
            .select()
            .single();
          wallet = createdWallet;
        }

        if (wallet) {
          const currentBalance = Number(wallet.balance_minor || 0);
          newBalanceMinor = currentBalance + refundAmountMinor;

          await supabase
            .from('wallets')
            .update({ balance_minor: newBalanceMinor, updated_at: new Date().toISOString() })
            .eq('id', wallet.id);

          await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            idempotency_key: idempotencyKey,
            type: 'refund',
            amount_minor: refundAmountMinor,
            reference_id: appointmentId,
            description: `Refund for cancelled appointment #${appointmentId.substring(0, 8)}`,
          });

          refundProcessed = true;
        }
      } else {
        refundProcessed = true;
      }
    }

    // 5. Update appointment status to cancelled
    const { data: updatedAppointment, error: updateErr } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { message: updateErr.message || 'Failed to update appointment status' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        appointment: updatedAppointment,
        refund: {
          processed: refundProcessed,
          amount_minor: refundAmountMinor,
          new_balance_minor: newBalanceMinor,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleCancelAppointment(request, params.id);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return handleCancelAppointment(request, params.id);
}
