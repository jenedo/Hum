import { ConfigService } from '@nestjs/config';
import { CircuitBreakerRegistry } from '../../common/resilience/circuit-breaker-registry';
import { MedicalRecordsService } from './medical-records.service';

/**
 * Verifies that Supabase Storage circuit breaker:
 * 1. Falls back to a placeholder URL on timeout.
 * 2. Falls back immediately when the circuit is open (no call to Supabase).
 * 3. Does not affect other dependencies.
 */
describe('MedicalRecordsService – storage circuit-breaker resilience', () => {
  let service: MedicalRecordsService;
  let registry: CircuitBreakerRegistry;
  let supabaseStorageMock: {
    storage: {
      from: jest.Mock;
    };
  };
  let prismaMock: Record<string, any>;
  let auditMock: { record: jest.Mock };
  let fileValidationMock: Record<string, never>;
  let createSignedUploadUrlMock: jest.Mock;
  let createSignedUrlMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();

    createSignedUploadUrlMock = jest.fn();
    createSignedUrlMock = jest.fn();

    supabaseStorageMock = {
      storage: {
        from: jest.fn().mockReturnValue({
          createSignedUploadUrl: createSignedUploadUrlMock,
          createSignedUrl: createSignedUrlMock,
        }),
      },
    };

    prismaMock = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'patient-1',
          userId: 'user-1',
        }),
      },
      storedObject: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'obj-1',
          bucketName: 'private-medical-records',
          objectKey: 'medical-records/patient-1/test.pdf',
          fileName: 'test.pdf',
          fileSizeBytes: 1024,
          mimeType: 'application/pdf',
          sha256Hash: 'abc123',
          purpose: 'LAB_RESULT',
          scanStatus: 'PENDING',
          createdAt: new Date(),
        }),
        update: jest.fn(),
      },
    };

    auditMock = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    fileValidationMock = {};

    const configValues: Record<string, unknown> = {
      SUPABASE_STORAGE_TIMEOUT_MS: 25,
      SUPABASE_STORAGE_CIRCUIT_FAILURE_THRESHOLD: 1,
      SUPABASE_STORAGE_CIRCUIT_RESET_MS: 100,
      SUPABASE_STORAGE_MAX_CONCURRENCY: 2,
    };

    const configService = {
      get: jest.fn(
        (key: string, fallback?: unknown) => configValues[key] ?? fallback,
      ),
    } as unknown as ConfigService;

    registry = new CircuitBreakerRegistry(configService);

    service = new MedicalRecordsService(
      prismaMock as any,
      auditMock as any,
      fileValidationMock as any,
      supabaseStorageMock as any,
      registry,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a placeholder URL when Supabase Storage times out', async () => {
    createSignedUploadUrlMock.mockReturnValue(
      new Promise(() => undefined), // never resolves
    );

    const resultPromise = service.createUploadIntent('user-1', {
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      purpose: 'LAB_RESULT' as any,
    });

    await jest.advanceTimersByTimeAsync(25);

    const result = await resultPromise;
    expect(result.uploadUrl).toContain('placeholder-storage.supabase.co');
    expect(result.storedObjectId).toBe('obj-1');
  });

  it('returns placeholder URL immediately when storage circuit is open', async () => {
    // Force the circuit open
    const breaker = registry.get('supabase-storage');
    try {
      await breaker.execute(() =>
        Promise.reject(new Error('storage-down')),
      );
    } catch {
      // expected
    }
    expect(breaker.getState()).toBe('open');

    // Should not call Supabase at all — fast-fail → placeholder
    const result = await service.createUploadIntent('user-1', {
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      purpose: 'LAB_RESULT' as any,
    });

    expect(result.uploadUrl).toContain('placeholder-storage.supabase.co');
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('does not affect the auth breaker when storage circuit is open', async () => {
    // Force storage circuit open
    const storageBreaker = registry.get('supabase-storage');
    try {
      await storageBreaker.execute(() =>
        Promise.reject(new Error('storage-down')),
      );
    } catch {
      // expected
    }
    expect(storageBreaker.getState()).toBe('open');

    // Auth breaker should be healthy
    const authBreaker = registry.get('supabase-auth');
    expect(authBreaker.getState()).toBe('closed');
    await expect(
      authBreaker.execute(() => Promise.resolve('auth-ok')),
    ).resolves.toBe('auth-ok');
  });
});
