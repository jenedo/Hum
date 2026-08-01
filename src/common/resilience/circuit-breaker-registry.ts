import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DependencyCircuitBreaker,
  DependencyCircuitBreakerOptions,
} from './dependency-circuit-breaker';

/**
 * Known dependency config prefixes.
 * Each maps to env vars like `<PREFIX>_TIMEOUT_MS`, etc.
 */
const KNOWN_DEFAULTS: Record<string, DependencyCircuitBreakerOptions> = {
  'supabase-auth': {
    timeoutMs: 3_000,
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    maxConcurrent: 5,
  },
  'supabase-storage': {
    timeoutMs: 5_000,
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    maxConcurrent: 3,
  },
  'payment-gateway': {
    timeoutMs: 10_000,
    failureThreshold: 3,
    resetTimeoutMs: 60_000,
    maxConcurrent: 3,
  },
  'firebase-cloud-messaging': {
    timeoutMs: 5_000,
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    maxConcurrent: 2,
  },
};

/**
 * Maps a dependency name like "supabase-auth" to an env-var prefix
 * like "SUPABASE_AUTH". Converts hyphens to underscores, uppercases.
 */
function toEnvPrefix(name: string): string {
  return name.replace(/-/g, '_').toUpperCase();
}

@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, DependencyCircuitBreaker>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns the circuit breaker for the given dependency name.
   * Creates it on first access with config-driven or default options.
   */
  get(name: string): DependencyCircuitBreaker {
    const existing = this.breakers.get(name);
    if (existing) {
      return existing;
    }

    const options = this.resolveOptions(name);
    const breaker = new DependencyCircuitBreaker(name, options);
    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Returns all registered breakers and their current metrics.
   */
  getAll(): Array<{
    name: string;
    state: string;
    consecutiveFailures: number;
    activeOperations: number;
  }> {
    return Array.from(this.breakers.values()).map((b) => b.getMetrics());
  }

  private resolveOptions(name: string): DependencyCircuitBreakerOptions {
    const defaults = KNOWN_DEFAULTS[name] ?? {
      timeoutMs: 5_000,
      failureThreshold: 3,
      resetTimeoutMs: 30_000,
      maxConcurrent: 3,
    };

    const prefix = toEnvPrefix(name);

    return {
      timeoutMs: this.config.get<number>(
        `${prefix}_TIMEOUT_MS`,
        defaults.timeoutMs,
      ),
      failureThreshold: this.config.get<number>(
        `${prefix}_CIRCUIT_FAILURE_THRESHOLD`,
        defaults.failureThreshold,
      ),
      resetTimeoutMs: this.config.get<number>(
        `${prefix}_CIRCUIT_RESET_MS`,
        defaults.resetTimeoutMs,
      ),
      maxConcurrent: this.config.get<number>(
        `${prefix}_MAX_CONCURRENCY`,
        defaults.maxConcurrent,
      ),
    };
  }
}
