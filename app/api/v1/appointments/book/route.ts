import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

interface BookAppointmentPayload {
  doctor_id?: string;
  doctorProfileId?: string;
  consultation_type?: string;
  consultationType?: string;
  appointment_time?: string;
  slotStart?: string;
  fee_minor?: number;
  totalFee?: number;
  notes?: string;
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

    const body: BookAppointmentPayload = await request.json();

    const doctorId = (body.doctor_id || body.doctorProfileId)?.trim();
    const consultationType = (body.consultation_type || body.consultationType)?.trim().toLowerCase();
    const appointmentTime = body.appointment_time || body.slotStart;
    const feeMinor = body.fee_minor ?? body.totalFee;

    if (!doctorId) {
      return NextResponse.json({ message: 'doctor_id is required' }, { status: 400 });
    }
    if (!consultationType || !['video', 'audio', 'chat'].includes(consultationType)) {
      return NextResponse.json(
        { message: 'Valid consultation_type (video, audio, chat) is required' },
        { status: 400 }
      );
    }
    if (!appointmentTime || isNaN(Date.parse(appointmentTime))) {
      return NextResponse.json(
        { message: 'Valid appointment_time (ISO-8601) is required' },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabaseClient();

    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: user.id,
        doctor_id: doctorId,
        consultation_type: consultationType,
        appointment_time: new Date(appointmentTime).toISOString(),
        fee_minor: feeMinor ?? 100000, // Default 1000 PKR (in paisa) if omitted
        notes: body.notes?.trim() || null,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) {
      const isConflict = error.code === '23505' || error.message.toLowerCase().includes('unique') || error.message.toLowerCase().includes('conflict') || error.message.toLowerCase().includes('already booked');
      return NextResponse.json(
        { message: isConflict ? 'Slot is already booked' : (error.message || 'Failed to book appointment') },
        { status: isConflict ? 409 : 400 }
      );
    }

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
