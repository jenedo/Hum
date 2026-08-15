import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { user, error } = await verifyAuthToken(request);

    if (error || !user) {
      // Still clear the session on client side even if token is invalid
      return NextResponse.json({ message: 'Logged out.' });
    }

    const supabase = getAdminSupabaseClient();
    await supabase.auth.admin.signOut(user.id);

    return NextResponse.json({ message: 'Logged out successfully.' });
  } catch (err) {
    // Always return success for logout — client should clear state regardless
    return NextResponse.json({ message: 'Logged out.' });
  }
}
