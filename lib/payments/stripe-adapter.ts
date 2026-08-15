import { PaymentAdapter, PaymentParams, PaymentResult, RefundResult } from './payment-adapter';

export class StripeAdapter implements PaymentAdapter {
  name = 'Stripe';

  async processPayment(params: PaymentParams): Promise<PaymentResult> {
    if (params.amount <= 0) {
      return {
        success: false,
        transactionId: '',
        rawResponse: { error: { message: 'Invalid positive integer amount' } },
        errorMessage: 'Amount must be greater than zero',
      };
    }

    const txId = `pi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return {
      success: true,
      transactionId: txId,
      rawResponse: {
        id: txId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: params.amount,
        currency: params.currency || 'usd',
      },
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResult> {
    if (!transactionId) {
      return {
        success: false,
        rawResponse: { error: { message: 'Missing payment_intent ID' } },
        errorMessage: 'Transaction ID is required for refund',
      };
    }

    const refundId = `re_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return {
      success: true,
      rawResponse: {
        id: refundId,
        object: 'refund',
        payment_intent: transactionId,
        status: 'succeeded',
        amount,
      },
    };
  }
}
