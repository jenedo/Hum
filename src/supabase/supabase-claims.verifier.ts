import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerRegistry } from '../common/resilience/circuit-breaker-registry';
import {
  CircuitOpenError,
  DependencyConcurrencyError,
  DependencyTimeoutError,
} from '../common/resilience/dependency-circuit-breaker';
import {
  SUPABASE_CLIENT,
  type SupabaseServerClient,
} from './supabase.constants';
import type { SupabasePrincipal } from './supabase-principal';

type GetClaimsResult = Awaited<
  ReturnType<SupabaseServerClient['auth']['getClaims']>
>;

const APPROVED_ALGORITHMS = new Set(['ES256', 'HS256']);

@Injectable()
export class SupabaseClaimsVerifier {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseServerClient,
    private readonly configService: ConfigService,
    private readonly circuitBreakerRegistry: CircuitBreakerRegistry,
  ) {}

  async verifyAccessToken(accessToken: string): Promise<SupabasePrincipal> {
    const token = accessToken.trim();
    if (!token) {
      throw this.invalidToken();
    }

    let result: GetClaimsResult;
    try {
      result = await this.circuitBreakerRegistry
        .get('supabase-auth')
        .execute(() => this.supabase.auth.getClaims(token));
    } catch (error) {
      if (
        error instanceof CircuitOpenError ||
        error instanceof DependencyTimeoutError ||
        error instanceof DependencyConcurrencyError
      ) {
        throw new UnauthorizedException(
          'Authentication service temporarily unavailable',
        );
      }
      throw this.invalidToken();
    }

    if (result.error || !result.data) {
      throw this.invalidToken();
    }

    const { claims, header } = result.data;
    if (!APPROVED_ALGORITHMS.has(header.alg)) {
      throw this.invalidToken();
    }

    const expectedIssuer = this.configService.getOrThrow<string>(
      'SUPABASE_JWT_ISSUER',
    );
    if (typeof claims.iss !== 'string' || claims.iss !== expectedIssuer) {
      throw this.invalidToken();
    }

    const expectedAudience = this.configService.getOrThrow<string>(
      'SUPABASE_JWT_AUDIENCE',
    );
    if (!this.hasExpectedAudience(claims.aud, expectedAudience)) {
      throw this.invalidToken();
    }

    if (
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw this.invalidToken();
    }

    if (typeof claims.sub !== 'string' || !claims.sub.trim()) {
      throw this.invalidToken();
    }

    if (typeof claims.session_id !== 'string' || !claims.session_id.trim()) {
      throw this.invalidToken();
    }

    const principal: SupabasePrincipal = {
      supabaseUserId: claims.sub,
      sessionId: claims.session_id,
    };

    if (typeof claims.email === 'string' && claims.email.trim()) {
      principal.email = claims.email;
    }
    if (typeof claims.phone === 'string' && claims.phone.trim()) {
      principal.phone = claims.phone;
    }
    if (typeof claims.aal === 'string' && claims.aal.trim()) {
      principal.aal = claims.aal;
    }

    return principal;
  }

  private hasExpectedAudience(value: unknown, expected: string): boolean {
    if (typeof value === 'string') {
      return value === expected;
    }

    return (
      Array.isArray(value) &&
      value.some((item) => typeof item === 'string' && item === expected)
    );
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException('Invalid access token');
  }
}

