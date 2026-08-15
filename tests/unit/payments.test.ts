/**
 * Unit Test Suite: Gateway-Agnostic Payment Adapter Abstraction
 * 
 * Verifies PaymentAdapter interface compliance for JazzCash, EasyPaisa, and Stripe.
 */

import { describe, test, expect } from 'vitest';
import { PaymentAdapter } from '@/lib/payments/payment-adapter';
import { JazzCashAdapter } from '@/lib/payments/jazzcash-adapter';
import { EasyPaisaAdapter } from '@/lib/payments/easypaisa-adapter';
import { StripeAdapter } from '@/lib/payments/stripe-adapter';

describe('Unit Test — Gateway-Agnostic Payment Adapters', () => {

  const adapters: PaymentAdapter[] = [
    new JazzCashAdapter(),
    new EasyPaisaAdapter(),
    new StripeAdapter(),
  ];

  adapters.forEach((adapter) => {
    describe(`Adapter Interface Compliance: ${adapter.name}`, () => {
      test('has correct adapter name', () => {
        expect(typeof adapter.name).toBe('string');
        expect(adapter.name.length).toBeGreaterThan(0);
      });

      test('processes valid payment successfully', async () => {
        const result = await adapter.processPayment({
          amount: 1500,
          currency: 'PKR',
          patientId: 'patient-123',
          appointmentId: 'appt-456',
        });

        expect(result.success).toBe(true);
        expect(result.transactionId).toBeDefined();
        expect(result.transactionId.length).toBeGreaterThan(0);
        expect(result.rawResponse).toBeDefined();
      });

      test('rejects payment with zero or negative amount', async () => {
        const result = await adapter.processPayment({
          amount: -500,
          currency: 'PKR',
          patientId: 'patient-123',
        });

        expect(result.success).toBe(false);
        expect(result.errorMessage).toBeDefined();
      });

      test('processes refund successfully', async () => {
        const refundResult = await adapter.refundPayment('TX_123456', 1500);
        expect(refundResult.success).toBe(true);
        expect(refundResult.rawResponse).toBeDefined();
      });

      test('rejects refund with empty transaction ID', async () => {
        const refundResult = await adapter.refundPayment('');
        expect(refundResult.success).toBe(false);
        expect(refundResult.errorMessage).toBeDefined();
      });
    });
  });

  describe('Polymorphic Adapter Factory Switching', () => {
    function getPaymentAdapter(gatewayName: string): PaymentAdapter {
      switch (gatewayName.toLowerCase()) {
        case 'jazzcash':
          return new JazzCashAdapter();
        case 'easypaisa':
          return new EasyPaisaAdapter();
        case 'stripe':
          return new StripeAdapter();
        default:
          throw new Error(`Unsupported payment gateway: ${gatewayName}`);
      }
    }

    test('instantiates appropriate adapter based on gateway selection', () => {
      expect(getPaymentAdapter('jazzcash')).toBeInstanceOf(JazzCashAdapter);
      expect(getPaymentAdapter('easypaisa')).toBeInstanceOf(EasyPaisaAdapter);
      expect(getPaymentAdapter('stripe')).toBeInstanceOf(StripeAdapter);
    });

    test('throws error for unsupported payment gateway', () => {
      expect(() => getPaymentAdapter('unknown_gateway')).toThrow('Unsupported payment gateway');
    });
  });
});
