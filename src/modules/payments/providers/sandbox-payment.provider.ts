import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CircuitBreakerRegistry } from '../../../common/resilience/circuit-breaker-registry';
import type {
  IPaymentProvider,
  PaymentIntent,
  WebhookVerificationResult,
} from './payment-provider.interface';

@Injectable()
export class SandboxPaymentProvider implements IPaymentProvider {
  readonly providerName = 'SANDBOX';

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreakerRegistry: CircuitBreakerRegistry,
  ) {}

  createPaymentIntent(
    orderId: string,
    amountMinor: number,
    currency: string,
    idempotencyKey: string,
    metadata?: Record<string, string>,
  ): Promise<PaymentIntent> {
    return this.circuitBreakerRegistry
      .get('payment-gateway')
      .execute(() => {
        void orderId;
        void idempotencyKey;
        void metadata;
        const providerRef = `sandbox_${randomUUID()}`;

        return Promise.resolve({
          providerRef,
          status: 'PENDING',
          amountMinor,
          currency,
          redirectUrl: `https://sandbox.asaancare.pk/pay/${providerRef}`,
          rawResponse: JSON.stringify({ sandbox: true, ref: providerRef }),
        });
      });
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    return this.circuitBreakerRegistry
      .get('payment-gateway')
      .execute(() => {
        void headers;
        let body: Record<string, unknown> = {};
        try {
          body = (
            typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
          ) as Record<string, unknown>;
        } catch {
          return Promise.resolve({
            valid: false,
            eventId: '',
            paymentRef: '',
            status: 'FAILED',
            amountMinor: 0,
            currency: 'PKR',
          });
        }

        const secret = typeof body.secret === 'string' ? body.secret : undefined;
        const expectedSecret =
          this.configService.get<string>('SANDBOX_WEBHOOK_SECRET') ||
          'sandbox_webhook_secret_placeholder';
        const valid = secret === expectedSecret;

        return Promise.resolve({
          valid,
          eventId: typeof body.eventId === 'string' ? body.eventId : '',
          paymentRef: typeof body.paymentRef === 'string' ? body.paymentRef : '',
          status: typeof body.status === 'string' ? body.status : 'FAILED',
          amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : 0,
          currency: typeof body.currency === 'string' ? body.currency : 'PKR',
        });
      });
  }
}

