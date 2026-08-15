import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category_id = searchParams.get('category_id')?.trim();
    const search = searchParams.get('search')?.trim();

    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(100, rawLimit);

    const offset = (page - 1) * limit;

    const supabase = getAdminSupabaseClient();

    let query = supabase
      .from('pharmacy_products')
      .select('*', { count: 'exact' });

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: error.message || 'Failed to fetch products' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { products: data ?? [], total: count ?? 0, page, limit },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
