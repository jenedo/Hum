import { ConfigService } from '@nestjs/config';
import { getMessaging } from 'firebase-admin/messaging';
import { CircuitBreakerRegistry } from '../../../common/resilience/circuit-breaker-registry';
import { FirebaseAdminService } from './firebase-admin.service';

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((value: unknown) => value),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

type BatchResponse = Awaited<
  ReturnType<ReturnType<typeof getMessaging>['sendEachForMulticast']>
>;

const successfulResponse = (): BatchResponse =>
  ({
    successCount: 1,
    failureCount: 0,
    responses: [{ success: true }],
  }) as BatchResponse;

describe('FirebaseAdminService resilience', () => {
  let service: FirebaseAdminService;
  let sendEachForMulticast: jest.Mock;
  let originalServiceAccount: string | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    originalServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      projectId: 'test-project',
    });
    sendEachForMulticast = jest.fn();
    jest.mocked(getMessaging).mockReturnValue({
      sendEachForMulticast,
    } as unknown as ReturnType<typeof getMessaging>);

    const values: Record<string, number> = {
      FIREBASE_CLOUD_MESSAGING_TIMEOUT_MS: 20,
      FIREBASE_CLOUD_MESSAGING_CIRCUIT_FAILURE_THRESHOLD: 1,
      FIREBASE_CLOUD_MESSAGING_CIRCUIT_RESET_MS: 50,
      FIREBASE_CLOUD_MESSAGING_MAX_CONCURRENCY: 1,
    };
    const configService = {
      get: jest.fn((key: string, fallback: number) => values[key] ?? fallback),
    } as unknown as ConfigService;

    const registry = new CircuitBreakerRegistry(configService);
    service = new FirebaseAdminService(registry);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalServiceAccount === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    } else {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalServiceAccount;
    }
    jest.clearAllMocks();
  });

  it('returns fallback on timeout, fast-fails while open, and recovers cleanly', async () => {
    let resolveSlowCall!: (value: BatchResponse) => void;
    sendEachForMulticast.mockReturnValueOnce(
      new Promise<BatchResponse>((resolve) => {
        resolveSlowCall = resolve;
      }),
    );

    const timedOutCall = service.sendMulticast(['token-1'], {
      title: 'title',
      body: 'body',
    });
    await jest.advanceTimersByTimeAsync(20);
    await expect(timedOutCall).resolves.toEqual({
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
    });

    await expect(
      service.sendMulticast(['token-2'], { title: 'title', body: 'body' }),
    ).resolves.toEqual({
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
    });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);

    resolveSlowCall(successfulResponse());
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(50);
    sendEachForMulticast.mockResolvedValueOnce(successfulResponse());

    await expect(
      service.sendMulticast(['token-3'], { title: 'title', body: 'body' }),
    ).resolves.toEqual({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
  });

  it('serves fallback immediately when the FCM concurrency limit is full', async () => {
    let resolveFirstCall!: (value: BatchResponse) => void;
    sendEachForMulticast.mockReturnValueOnce(
      new Promise<BatchResponse>((resolve) => {
        resolveFirstCall = resolve;
      }),
    );

    const firstCall = service.sendMulticast(['token-1'], {
      title: 'title',
      body: 'body',
    });

    await expect(
      service.sendMulticast(['token-2'], { title: 'title', body: 'body' }),
    ).resolves.toEqual({
      successCount: 0,
      failureCount: 1,
      invalidTokens: [],
    });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);

    resolveFirstCall(successfulResponse());
    await expect(firstCall).resolves.toEqual({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    });
  });
});
