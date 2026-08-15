import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name')?.trim() || searchParams.get('search')?.trim();
    const specialty = searchParams.get('specialty')?.trim() || searchParams.get('specialization')?.trim();

    const rawMinExp = searchParams.get('minExperience');
    const parsedMinExp = rawMinExp !== null ? parseInt(rawMinExp, 10) : null;
    const minExperience = parsedMinExp !== null && !isNaN(parsedMinExp) ? Math.max(0, parsedMinExp) : null;

    const rawMaxFee = searchParams.get('maxFee');
    const parsedMaxFee = rawMaxFee !== null ? parseInt(rawMaxFee, 10) : null;
    const maxFee = parsedMaxFee !== null && !isNaN(parsedMaxFee) && parsedMaxFee >= 0 ? parsedMaxFee : null;

    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

    const rawLimit = parseInt(searchParams.get('limit') || '10', 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(100, rawLimit);

    const offset = (page - 1) * limit;

    const supabase = getAdminSupabaseClient();

    let query = supabase
      .from('doctors')
      .select(`
        id,
        license_number,
        specialization,
        qualification,
        experience_years,
        consultation_fee_minor,
        rating,
        review_count,
        is_verified,
        created_at,
        profiles (
          full_name,
          avatar_url,
          email,
          phone
        )
      `, { count: 'exact' })
      .eq('is_verified', true);

    if (specialty) {
      query = query.eq('specialization', specialty);
    }
    if (minExperience !== null) {
      query = query.gte('experience_years', minExperience);
    }
    if (maxFee !== null) {
      query = query.lte('consultation_fee_minor', maxFee);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      // Fallback: query without join if profiles relation fails
      const fallbackQuery = await supabase
        .from('doctors')
        .select('*', { count: 'exact' })
        .eq('is_verified', true)
        .range(offset, offset + limit - 1);

      return NextResponse.json({
        doctors: fallbackQuery.data ?? [],
        data: fallbackQuery.data ?? [],
        total: fallbackQuery.count ?? 0,
        page,
        limit,
      }, { status: 200 });
    }

    // Flatten profiles into each doctor for easier frontend consumption
    const doctors = (data ?? []).map((doc: Record<string, unknown>) => {
      const profile = doc.profiles as Record<string, unknown> | null;
      return {
        ...doc,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
      };
    });

    return NextResponse.json({
      doctors,
      data: doctors,
      total: count ?? 0,
      page,
      limit,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
