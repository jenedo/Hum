import { ConfigService } from '@nestjs/config';
import { CircuitBreakerRegistry } from './circuit-breaker-registry';

describe('CircuitBreakerRegistry', () => {
  const configValues: Record<string, number> = {
    SUPABASE_AUTH_TIMEOUT_MS: 1_500,
    SUPABASE_AUTH_CIRCUIT_FAILURE_THRESHOLD: 2,
    SUPABASE_AUTH_CIRCUIT_RESET_MS: 10_000,
    SUPABASE_AUTH_MAX_CONCURRENCY: 4,
  };

  const configService = {
    get: jest.fn(
      (key: string, fallback: number) => configValues[key] ?? fallback,
    ),
  } as unknown as ConfigService;

  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry(configService);
  });

  it('returns the same breaker instance for the same name', () => {
    const first = registry.get('supabase-auth');
    const second = registry.get('supabase-auth');
    expect(first).toBe(second);
  });

  it('returns different breaker instances for different names', () => {
    const auth = registry.get('supabase-auth');
    const storage = registry.get('supabase-storage');
    expect(auth).not.toBe(storage);
  });

  it('reads config values from ConfigService', () => {
    const breaker = registry.get('supabase-auth');
    const metrics = breaker.getMetrics();
    expect(metrics.name).toBe('supabase-auth');
    expect(metrics.state).toBe('closed');

    // Verify ConfigService was queried for the right env vars
    expect(configService.get).toHaveBeenCalledWith(
      'SUPABASE_AUTH_TIMEOUT_MS',
      expect.any(Number),
    );
    expect(configService.get).toHaveBeenCalledWith(
      'SUPABASE_AUTH_CIRCUIT_FAILURE_THRESHOLD',
      expect.any(Number),
    );
  });

  it('applies default options for unknown dependencies', async () => {
    const breaker = registry.get('unknown-dependency');
    // Should not throw — defaults are applied
    await expect(
      breaker.execute(() => Promise.resolve('ok')),
    ).resolves.toBe('ok');
  });

  it('getAll returns metrics for all registered breakers', () => {
    registry.get('supabase-auth');
    registry.get('supabase-storage');
    registry.get('payment-gateway');

    const all = registry.getAll();
    expect(all).toHaveLength(3);

    const names = all.map((m) => m.name);
    expect(names).toContain('supabase-auth');
    expect(names).toContain('supabase-storage');
    expect(names).toContain('payment-gateway');
  });
});
