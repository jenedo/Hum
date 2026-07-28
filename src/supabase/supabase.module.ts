import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseClaimsVerifier } from './supabase-claims.verifier';
import {
  SUPABASE_CLIENT,
  SUPABASE_SECRET_CLIENT,
  type SupabaseAuthDatabase,
  type SupabaseServerClient,
} from './supabase.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): SupabaseServerClient =>
        createClient<SupabaseAuthDatabase>(
          configService.getOrThrow<string>('SUPABASE_URL'),
          configService.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'),
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          },
        ),
    },
    {
      provide: SUPABASE_SECRET_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): SupabaseServerClient => {
        const url = configService.getOrThrow<string>('SUPABASE_URL');
        const key =
          configService.get<string>('SUPABASE_SECRET_KEY') ||
          configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
          configService.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
        return createClient<SupabaseAuthDatabase>(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
      },
    },
    SupabaseClaimsVerifier,
    SupabaseAuthGuard,
  ],
  exports: [
    SUPABASE_CLIENT,
    SUPABASE_SECRET_CLIENT,
    SupabaseClaimsVerifier,
    SupabaseAuthGuard,
  ],
})
export class SupabaseModule {}
