import { User } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from './supabase';

export interface AuthResult {
  user: User | null;
  error: string | null;
}

export async function verifyAuthToken(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return { user: null, error: 'Missing Authorization header' };
  }

  const token = authHeader.replace(/^Bearer\s*/i, '').trim();
  if (!token) {
    return { user: null, error: 'Malformed Authorization token' };
  }

  try {
    const supabase = getAdminSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return { user: null, error: error?.message || 'Invalid or expired token' };
    }

    return { user: data.user, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return { user: null, error: message };
  }
}
