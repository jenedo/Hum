import type { Request } from 'express';

export type SupabasePrincipal = {
  supabaseUserId: string;
  sessionId: string;
  email?: string;
  phone?: string;
  aal?: string;
};

export type SupabaseAuthenticatedRequest = Request & {
  supabasePrincipal?: SupabasePrincipal;
};
