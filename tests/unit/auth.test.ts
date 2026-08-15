/**
 * Unit Test Suite: Clerk JWT Auth Middleware & Verification
 * 
 * Verifies lib/auth.ts verifyAuthToken behavior across all token states.
 */

import { describe, test, expect, vi } from 'vitest';
import { verifyAuthToken } from '@/lib/auth';

describe('Unit Test — Auth Middleware (lib/auth.ts)', () => {
  test('returns error when Authorization header is missing', async () => {
    const req = new Request('http://localhost:3000/api/v1/test', {
      method: 'GET',
    });

    const result = await verifyAuthToken(req);
    expect(result.user).toBeNull();
    expect(result.error).toBe('Missing Authorization header');
  });

  test('returns error when Bearer token is empty or whitespace', async () => {
    const req = new Request('http://localhost:3000/api/v1/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' },
    });

    const result = await verifyAuthToken(req);
    expect(result.user).toBeNull();
    expect(result.error).toBe('Malformed Authorization token');
  });

  test('returns error when token format is invalid (missing Bearer prefix)', async () => {
    const req = new Request('http://localhost:3000/api/v1/test', {
      method: 'GET',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });

    const result = await verifyAuthToken(req);
    // Stripping non-Bearer or invalid token fails getUser verification
    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
  });

  test('handles expired or invalid JWT token gracefully without throwing unhandled rejection', async () => {
    const req = new Request('http://localhost:3000/api/v1/test', {
      method: 'GET',
      headers: { Authorization: 'Bearer EXPIRED_OR_INVALID_JWT' },
    });

    const result = await verifyAuthToken(req);
    expect(result.user).toBeNull();
    expect(typeof result.error).toBe('string');
  });
});
