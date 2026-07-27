export interface PaymentIntent {
  providerRef: string;
  status: string;
  amountMinor: number;
  currency: string;
  redirectUrl?: string;
  rawResponse: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  eventId: string;
  paymentRef: string;
  status: string;
  amountMinor: number;
  currency: string;
}

export interface IPaymentProvider {
  readonly providerName: string;
  createPaymentIntent(
    orderId: string,
    amountMinor: number,
    currency: string,
    idempotencyKey: string,
    metadata?: Record<string, string>,
  ): Promise<PaymentIntent>;
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult>;
}
