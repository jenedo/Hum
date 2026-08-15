import { PaymentAdapter, PaymentParams, PaymentResult, RefundResult } from './payment-adapter';

export class EasyPaisaAdapter implements PaymentAdapter {
  name = 'EasyPaisa';

  async processPayment(params: PaymentParams): Promise<PaymentResult> {
    if (params.amount <= 0) {
      return {
        success: false,
        transactionId: '',
        rawResponse: { responseCode: '0001', responseDesc: 'Bad Request' },
        errorMessage: 'Amount must be greater than zero',
      };
    }

    const txId = `EP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    return {
      success: true,
      transactionId: txId,
      rawResponse: {
        responseCode: '0000',
        responseDesc: 'SUCCESS',
        transactionId: txId,
        orderId: params.appointmentId || 'EP_ORDER_1',
      },
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResult> {
    if (!transactionId) {
      return {
        success: false,
        rawResponse: { responseCode: '0002' },
        errorMessage: 'Invalid transaction ID for refund',
      };
    }

    return {
      success: true,
      rawResponse: {
        responseCode: '0000',
        responseDesc: 'REFUND_SUCCESS',
        origTransactionId: transactionId,
        amount,
      },
    };
  }
}
