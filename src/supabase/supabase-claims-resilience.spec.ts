import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerRegistry } from '../common/resilience/circuit-breaker-registry';
import { SupabaseClaimsVerifier } from './supabase-claims.verifier';

/**
 * These tests verify that a slow/failing Supabase Auth dependency:
 * 1. Times out and throws UnauthorizedException (not a raw timeout error).
 * 2. Trips the circuit and fast-fails subsequent requests.
 * 3. Does NOT affect independent dependencies.
 * 4. Recovers cleanly after the reset timeout.
 */
describe('SupabaseClaimsVerifier – circuit-breaker resilience', () => {
  const futureExp = Math.floor(Date.now() / 1000) + 3600;

  const validClaims = {
    data: {
      claims: {
        iss: 'https://test.supabase.co/auth/v1',
        aud: 'authenticated',
        sub: 'user-uuid-123',
        session_id: 'session-uuid-123',
        exp: futureExp,
        email: 'test@example.com',
      },
      header: { alg: 'HS256' },
    },
    error: null,
  };

  let supabaseMock: { auth: { getClaims: jest.Mock } };
  let configService: ConfigService;
  let registry: CircuitBreakerRegistry;
  let verifier: SupabaseClaimsVerifier;

  beforeEach(() => {
    jest.useFakeTimers();
    supabaseMock = {
      auth: { getClaims: jest.fn() },
    };

    const configValues: Record<string, unknown> = {
      SUPABASE_JWT_ISSUER: 'https://test.supabase.co/auth/v1',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      SUPABASE_AUTH_TIMEOUT_MS: 25,
      SUPABASE_AUTH_CIRCUIT_FAILURE_THRESHOLD: 1,
      SUPABASE_AUTH_CIRCUIT_RESET_MS: 100,
      SUPABASE_AUTH_MAX_CONCURRENCY: 2,
    };

    configService = {
      get: jest.fn(
        (key: string, fallback?: unknown) => configValues[key] ?? fallback,
      ),
      getOrThrow: jest.fn((key: string) => {
        if (configValues[key] !== undefined) return configValues[key];
        throw new Error(`Missing ${key}`);
      }),
    } as unknown as ConfigService;

    registry = new CircuitBreakerRegistry(configService);
    verifier = new SupabaseClaimsVerifier(
      supabaseMock as any,
      configService,
      registry,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('times out a slow Supabase Auth call and throws UnauthorizedException', async () => {
    supabaseMock.auth.getClaims.mockReturnValue(
      new Promise(() => undefined), // never resolves
    );

    const callPromise = verifier.verifyAccessToken('valid-token');
    // Attach the rejection handler BEFORE advancing timers to avoid
    // an unhandled promise rejection during advanceTimersByTimeAsync.
    const assertion = expect(callPromise).rejects.toThrow(UnauthorizedException);
    await jest.advanceTimersByTimeAsync(25);
    await assertion;

    await expect(callPromise).rejects.toThrow(
      'Authentication service temporarily unavailable',
    );
  });

  it('fast-fails with UnauthorizedException when the circuit is open', async () => {
    supabaseMock.auth.getClaims.mockReturnValue(
      new Promise(() => undefined),
    );

    const firstCall = verifier.verifyAccessToken('token-1');
    const firstAssertion = expect(firstCall).rejects.toThrow(UnauthorizedException);
    await jest.advanceTimersByTimeAsync(25);
    await firstAssertion;

    // Circuit is now open — second call should fast-fail without calling getClaims again
    await expect(
      verifier.verifyAccessToken('token-2'),
    ).rejects.toThrow(UnauthorizedException);
    expect(supabaseMock.auth.getClaims).toHaveBeenCalledTimes(1);
  });

  it('does not affect an independent breaker when auth circuit is open', async () => {
    supabaseMock.auth.getClaims.mockReturnValue(
      new Promise(() => undefined),
    );

    const authCall = verifier.verifyAccessToken('token-1');
    const authAssertion = expect(authCall).rejects.toThrow(UnauthorizedException);
    await jest.advanceTimersByTimeAsync(25);
    await authAssertion;

    // A different breaker in the same registry should be healthy
    const storageBreaker = registry.get('supabase-storage');
    await expect(
      storageBreaker.execute(() => Promise.resolve('storage-ok')),
    ).resolves.toBe('storage-ok');
  });

  it('recovers cleanly after the reset timeout', async () => {
    supabaseMock.auth.getClaims.mockReturnValue(
      new Promise(() => undefined),
    );

    const failedCall = verifier.verifyAccessToken('token-1');
    const failedAssertion = expect(failedCall).rejects.toThrow(UnauthorizedException);
    await jest.advanceTimersByTimeAsync(25);
    await failedAssertion;

    // Wait for reset timeout
    await jest.advanceTimersByTimeAsync(100);

    // Now provide a successful response
    supabaseMock.auth.getClaims.mockResolvedValueOnce(validClaims);

    const principal = await verifier.verifyAccessToken('token-recovery');
    expect(principal.supabaseUserId).toBe('user-uuid-123');

    // Circuit should be closed
    const authBreaker = registry.get('supabase-auth');
    expect(authBreaker.getState()).toBe('closed');
  });
});
