import {
  CircuitOpenError,
  DependencyCircuitBreaker,
  DependencyConcurrencyError,
  DependencyTimeoutError,
} from './dependency-circuit-breaker';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('DependencyCircuitBreaker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('times out a slow dependency, opens, and fast-fails without another call', async () => {
    jest.useFakeTimers();
    const breaker = new DependencyCircuitBreaker('slow-provider', {
      timeoutMs: 25,
      failureThreshold: 1,
      resetTimeoutMs: 100,
      maxConcurrent: 2,
    });
    const operation = jest.fn(() => new Promise<string>(() => undefined));

    const firstCall = breaker.execute(operation);
    const firstExpectation = expect(firstCall).rejects.toBeInstanceOf(
      DependencyTimeoutError,
    );
    await jest.advanceTimersByTimeAsync(25);
    await firstExpectation;

    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(breaker.getState()).toBe('open');
  });

  it('rejects excess concurrency while keeping the underlying permit occupied', async () => {
    const breaker = new DependencyCircuitBreaker('limited-provider', {
      timeoutMs: 1_000,
      failureThreshold: 3,
      resetTimeoutMs: 100,
      maxConcurrent: 1,
    });
    const inFlight = deferred<string>();

    const firstCall = breaker.execute(() => inFlight.promise);

    await expect(
      breaker.execute(() => Promise.resolve('should-not-run')),
    ).rejects.toBeInstanceOf(DependencyConcurrencyError);

    inFlight.resolve('complete');
    await expect(firstCall).resolves.toBe('complete');
  });

  it('isolates unrelated dependency work from a degraded circuit', async () => {
    jest.useFakeTimers();
    const degraded = new DependencyCircuitBreaker('degraded-provider', {
      timeoutMs: 20,
      failureThreshold: 1,
      resetTimeoutMs: 100,
      maxConcurrent: 1,
    });
    const healthy = new DependencyCircuitBreaker('healthy-provider', {
      timeoutMs: 20,
      failureThreshold: 1,
      resetTimeoutMs: 100,
      maxConcurrent: 1,
    });
    const hanging = deferred<string>();

    const degradedCall = degraded.execute(() => hanging.promise);

    await expect(
      healthy.execute(() => Promise.resolve('healthy-result')),
    ).resolves.toBe('healthy-result');

    const degradedExpectation = expect(degradedCall).rejects.toBeInstanceOf(
      DependencyTimeoutError,
    );
    await jest.advanceTimersByTimeAsync(20);
    await degradedExpectation;
    hanging.resolve('late-result');
  });

  it('allows one half-open probe and closes after a successful recovery', async () => {
    jest.useFakeTimers();
    const breaker = new DependencyCircuitBreaker('recovering-provider', {
      timeoutMs: 20,
      failureThreshold: 1,
      resetTimeoutMs: 50,
      maxConcurrent: 2,
    });

    await expect(
      breaker.execute(() => Promise.reject(new Error('provider down'))),
    ).rejects.toThrow('provider down');
    expect(breaker.getState()).toBe('open');

    await jest.advanceTimersByTimeAsync(50);
    await expect(
      breaker.execute(() => Promise.resolve('probe-success')),
    ).resolves.toBe('probe-success');

    expect(breaker.getState()).toBe('closed');
    await expect(
      breaker.execute(() => Promise.resolve('normal-traffic')),
    ).resolves.toBe('normal-traffic');
  });

  it('getMetrics returns name, state, consecutiveFailures, and activeOperations', async () => {
    const breaker = new DependencyCircuitBreaker('metrics-provider', {
      timeoutMs: 1_000,
      failureThreshold: 2,
      resetTimeoutMs: 100,
      maxConcurrent: 5,
    });

    const initialMetrics = breaker.getMetrics();
    expect(initialMetrics).toEqual({
      name: 'metrics-provider',
      state: 'closed',
      consecutiveFailures: 0,
      activeOperations: 0,
    });

    await expect(
      breaker.execute(() => Promise.reject(new Error('fail-1'))),
    ).rejects.toThrow('fail-1');

    const afterFailure = breaker.getMetrics();
    expect(afterFailure.consecutiveFailures).toBe(1);
    expect(afterFailure.state).toBe('closed');

    await expect(
      breaker.execute(() => Promise.reject(new Error('fail-2'))),
    ).rejects.toThrow('fail-2');

    const afterOpen = breaker.getMetrics();
    expect(afterOpen.state).toBe('open');
    expect(afterOpen.consecutiveFailures).toBe(2);
  });
});
