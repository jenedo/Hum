export interface PaymentParams {
  amount: number;
  currency: string;
  patientId: string;
  appointmentId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  rawResponse: any;
  errorMessage?: string;
}

export interface RefundResult {
  success: boolean;
  rawResponse: any;
  errorMessage?: string;
}

export interface PaymentAdapter {
  name: string;
  processPayment(params: PaymentParams): Promise<PaymentResult>;
  refundPayment(transactionId: string, amount?: number): Promise<RefundResult>;
}
