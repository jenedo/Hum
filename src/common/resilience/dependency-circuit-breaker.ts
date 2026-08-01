export type CircuitState = 'closed' | 'open' | 'half-open';

export type DependencyCircuitBreakerOptions = {
  timeoutMs: number;
  failureThreshold: number;
  resetTimeoutMs: number;
  maxConcurrent: number;
};

export class CircuitOpenError extends Error {
  constructor(dependencyName: string) {
    super(`${dependencyName} circuit is open`);
    this.name = CircuitOpenError.name;
  }
}

export class DependencyTimeoutError extends Error {
  constructor(dependencyName: string, timeoutMs: number) {
    super(`${dependencyName} timed out after ${timeoutMs}ms`);
    this.name = DependencyTimeoutError.name;
  }
}

export class DependencyConcurrencyError extends Error {
  constructor(dependencyName: string) {
    super(`${dependencyName} concurrency limit reached`);
    this.name = DependencyConcurrencyError.name;
  }
}

export class DependencyCircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private activeOperations = 0;
  private halfOpenProbeActive = false;

  constructor(
    private readonly dependencyName: string,
    private readonly options: DependencyCircuitBreakerOptions,
  ) {
    this.validateOptions(options);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): {
    name: string;
    state: CircuitState;
    consecutiveFailures: number;
    activeOperations: number;
  } {
    return {
      name: this.dependencyName,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      activeOperations: this.activeOperations,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.refreshOpenState();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.dependencyName);
    }
    if (this.state === 'half-open' && this.halfOpenProbeActive) {
      throw new CircuitOpenError(this.dependencyName);
    }
    if (this.activeOperations >= this.options.maxConcurrent) {
      throw new DependencyConcurrencyError(this.dependencyName);
    }

    const isHalfOpenProbe = this.state === 'half-open';
    if (isHalfOpenProbe) {
      this.halfOpenProbeActive = true;
    }

    this.activeOperations += 1;
    const operationPromise = Promise.resolve().then(operation);
    void operationPromise.then(
      () => this.releaseOperation(),
      () => this.releaseOperation(),
    );

    try {
      const result = await this.withTimeout(operationPromise);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      if (isHalfOpenProbe) {
        this.halfOpenProbeActive = false;
      }
    }
  }

  private refreshOpenState(): void {
    if (
      this.state === 'open' &&
      Date.now() - this.openedAt >= this.options.resetTimeoutMs
    ) {
      this.state = 'half-open';
      this.halfOpenProbeActive = false;
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.openedAt = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  private releaseOperation(): void {
    this.activeOperations = Math.max(0, this.activeOperations - 1);
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new DependencyTimeoutError(
            this.dependencyName,
            this.options.timeoutMs,
          ),
        );
      }, this.options.timeoutMs);

      void operation.then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private validateOptions(options: DependencyCircuitBreakerOptions): void {
    for (const [name, value] of Object.entries(options)) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive integer`);
      }
    }
  }
}
