import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase
      .from('pharmacy_categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch categories' },
        { status: 400 }
      );
    }

    return NextResponse.json({ categories: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
