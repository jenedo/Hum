import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { CircuitBreakerRegistry } from '../../../common/resilience/circuit-breaker-registry';

export type FCMPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type SendResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private enabled = false;

  constructor(
    private readonly circuitBreakerRegistry: CircuitBreakerRegistry,
  ) {}

  onModuleInit() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn(
        'Firebase Admin SDK not configured - notifications disabled',
      );
      this.enabled = false;
      return;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      if (!getApps().length) {
        initializeApp({
          credential: cert(serviceAccount),
        });
      }
      this.enabled = true;
      this.logger.log('Firebase Admin SDK successfully initialized');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Firebase Admin SDK not configured - notifications disabled (${errorMessage})`,
      );
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendMulticast(
    tokens: string[],
    payload: FCMPayload,
  ): Promise<SendResult> {
    if (!this.enabled || !tokens.length) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    try {
      const response = await this.circuitBreakerRegistry
        .get('firebase-cloud-messaging')
        .execute(() =>
          getMessaging().sendEachForMulticast({
            tokens,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: payload.data,
          }),
        );

      const invalidTokens: string[] = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.name : 'UnknownError';
      this.logger.warn(`Multicast delivery unavailable (${reason})`);
      return {
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
      };
    }
  }
}

