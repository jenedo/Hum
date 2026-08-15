import { PaymentAdapter, PaymentParams, PaymentResult, RefundResult } from './payment-adapter';

export class JazzCashAdapter implements PaymentAdapter {
  name = 'JazzCash';

  async processPayment(params: PaymentParams): Promise<PaymentResult> {
    if (params.amount <= 0) {
      return {
        success: false,
        transactionId: '',
        rawResponse: { pp_ResponseCode: '115', pp_ResponseMessage: 'Invalid Amount' },
        errorMessage: 'Invalid payment amount',
      };
    }

    const txId = `JC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    return {
      success: true,
      transactionId: txId,
      rawResponse: {
        pp_ResponseCode: '000',
        pp_ResponseMessage: 'Transaction Successful',
        pp_TxnRefNo: txId,
        pp_Amount: params.amount,
        pp_Currency: params.currency || 'PKR',
      },
    };
  }

  async refundPayment(transactionId: string, amount?: number): Promise<RefundResult> {
    if (!transactionId) {
      return {
        success: false,
        rawResponse: { pp_ResponseCode: '101' },
        errorMessage: 'Missing transaction ID',
      };
    }

    return {
      success: true,
      rawResponse: {
        pp_ResponseCode: '000',
        pp_ResponseMessage: 'Refund Processed',
        pp_TxnRefNo: transactionId,
        refundedAmount: amount,
      },
    };
  }
}
