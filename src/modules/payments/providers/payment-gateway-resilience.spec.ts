import { ConfigService } from '@nestjs/config';
import { CircuitBreakerRegistry } from '../../../common/resilience/circuit-breaker-registry';
import {
  CircuitOpenError,
  DependencyTimeoutError,
} from '../../../common/resilience/dependency-circuit-breaker';
import { SandboxPaymentProvider } from './sandbox-payment.provider';

/**
 * Verifies that the payment gateway circuit breaker:
 * 1. Times out slow provider calls.
 * 2. Trips the circuit and fast-fails without another provider call.
 * 3. Recovers after the reset timeout.
 */
describe('SandboxPaymentProvider – circuit-breaker resilience', () => {
  let provider: SandboxPaymentProvider;
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    jest.useFakeTimers();

    const configValues: Record<string, unknown> = {
      SANDBOX_WEBHOOK_SECRET: 'test_secret',
      PAYMENT_GATEWAY_TIMEOUT_MS: 25,
      PAYMENT_GATEWAY_CIRCUIT_FAILURE_THRESHOLD: 1,
      PAYMENT_GATEWAY_CIRCUIT_RESET_MS: 100,
      PAYMENT_GATEWAY_MAX_CONCURRENCY: 2,
    };

    const configService = {
      get: jest.fn(
        (key: string, fallback?: unknown) => configValues[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    registry = new CircuitBreakerRegistry(configService);
    provider = new SandboxPaymentProvider(configService, registry);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('createPaymentIntent succeeds under normal conditions', async () => {
    const result = await provider.createPaymentIntent(
      'order-1',
      50000,
      'PKR',
      'idem-key-1',
    );

    expect(result.status).toBe('PENDING');
    expect(result.providerRef).toMatch(/^sandbox_/);
    expect(result.amountMinor).toBe(50000);
  });

  it('verifyWebhook succeeds with correct secret', async () => {
    const body = JSON.stringify({
      secret: 'test_secret',
      eventId: 'evt-1',
      paymentRef: 'ref-1',
      status: 'SUCCEEDED',
      amountMinor: 50000,
      currency: 'PKR',
    });

    const result = await provider.verifyWebhook(body, {});
    expect(result.valid).toBe(true);
    expect(result.eventId).toBe('evt-1');
  });

  it('fast-fails when the payment-gateway circuit is open', async () => {
    const breaker = registry.get('payment-gateway');

    // Force the circuit open by feeding it a failure
    try {
      await breaker.execute(() => Promise.reject(new Error('gateway-down')));
    } catch {
      // expected
    }

    expect(breaker.getState()).toBe('open');

    // Now provider calls should fast-fail with CircuitOpenError
    await expect(
      provider.createPaymentIntent('order-2', 10000, 'PKR', 'idem-key-2'),
    ).rejects.toBeInstanceOf(CircuitOpenError);

    await expect(
      provider.verifyWebhook('{}', {}),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('recovers after the reset timeout', async () => {
    const breaker = registry.get('payment-gateway');

    // Force the circuit open
    try {
      await breaker.execute(() => Promise.reject(new Error('gateway-down')));
    } catch {
      // expected
    }
    expect(breaker.getState()).toBe('open');

    // Wait for reset timeout
    await jest.advanceTimersByTimeAsync(100);

    // Should recover — sandbox provider always resolves
    const result = await provider.createPaymentIntent(
      'order-3',
      20000,
      'PKR',
      'idem-key-3',
    );
    expect(result.status).toBe('PENDING');
    expect(breaker.getState()).toBe('closed');
  });
});
