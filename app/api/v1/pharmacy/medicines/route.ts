import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');

    const supabase = getAdminSupabaseClient();
    let query = supabase.from('medicines').select('*').limit(20);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    let { data, error } = await query;

    if (error && error.message?.includes('does not exist')) {
      let fallbackQuery = supabase.from('pharmacy_medicines').select('*').limit(20);
      if (search) fallbackQuery = fallbackQuery.ilike('name', `%${search}%`);
      if (category) fallbackQuery = fallbackQuery.eq('category_id', category);
      const res = await fallbackQuery;
      data = res.data;
      error = res.error;
    }

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch medicines' },
        { status: 400 }
      );
    }

    return NextResponse.json({ medicines: data ?? [] }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
