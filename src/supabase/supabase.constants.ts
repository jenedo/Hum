import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = Symbol('SUPABASE_CLIENT');
export const SUPABASE_SECRET_CLIENT = Symbol('SUPABASE_SECRET_CLIENT');

export type SupabaseAuthDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type SupabaseServerClient = SupabaseClient<SupabaseAuthDatabase>;
