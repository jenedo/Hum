import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PharmacyOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OutboxEventService } from '../notifications/outbox-event.service';
import { PharmacyInventoryService } from '../pharmacy/pharmacy-inventory.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    paymentAttempt: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    pharmacyOrder: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    paymentWebhookEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    orderStatusHistory: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let sandboxProvider: {
    createPaymentIntent: jest.Mock;
    verifyWebhook: jest.Mock;
  };
  let inventoryService: {
    consumeReservation: jest.Mock;
    releaseReservation: jest.Mock;
  };
  let outboxService: {
    createEvent: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      paymentAttempt: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      pharmacyOrder: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof prisma) => Promise<unknown>) =>
        cb(prisma),
      ),
    };

    sandboxProvider = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        providerRef: 'sandbox_ref_123',
        status: 'PENDING',
        amountMinor: 50000,
        currency: 'PKR',
        redirectUrl: 'https://sandbox.asaancare.pk/pay/sandbox_ref_123',
        rawResponse: '{"sandbox":true}',
      }),
      verifyWebhook: jest.fn(),
    };

    inventoryService = {
      consumeReservation: jest.fn().mockResolvedValue(undefined),
      releaseReservation: jest.fn().mockResolvedValue(undefined),
    };

    outboxService = {
      createEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SandboxPaymentProvider, useValue: sandboxProvider },
        { provide: PharmacyInventoryService, useValue: inventoryService },
        { provide: OutboxEventService, useValue: outboxService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'SANDBOX_WEBHOOK_SECRET'
                ? 'sandbox_secret_key'
                : undefined,
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('createPaymentIntent returns existing attempt on duplicate idempotencyKey', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'existing-pay-1',
      providerRef: 'sandbox_existing',
      status: PaymentStatus.PENDING,
    });

    const dto: CreatePaymentIntentDto = {
      orderId: 'order-1',
      idempotencyKey: 'key-dup',
      provider: PaymentProvider.SANDBOX,
    };

    const res = await service.createPaymentIntent('user-1', dto);
    expect(res.paymentId).toBe('existing-pay-1');
    expect(res.status).toBe(PaymentStatus.PENDING);
    expect(sandboxProvider.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('createPaymentIntent throws NotFoundException for unowned order', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue(null);
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      patient: { userId: 'other-user' },
    });

    const dto: CreatePaymentIntentDto = {
      orderId: 'order-1',
      idempotencyKey: 'key-1',
    };

    await expect(service.createPaymentIntent('user-1', dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('createPaymentIntent throws BadRequestException for non-PENDING_PAYMENT order', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue(null);
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: PharmacyOrderStatus.PAID,
      patient: { userId: 'user-1' },
    });

    const dto: CreatePaymentIntentDto = {
      orderId: 'order-1',
      idempotencyKey: 'key-1',
    };

    await expect(service.createPaymentIntent('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('createPaymentIntent creates PaymentAttempt with PENDING status', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue(null);
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      totalMinor: 50000,
      currency: 'PKR',
      status: PharmacyOrderStatus.PENDING_PAYMENT,
      patient: { userId: 'user-1' },
    });
    prisma.paymentAttempt.create.mockResolvedValue({
      id: 'pay-new-1',
      status: PaymentStatus.PENDING,
      providerRef: 'sandbox_ref_123',
    });

    const dto: CreatePaymentIntentDto = {
      orderId: 'order-1',
      idempotencyKey: 'key-new',
    };

    const res = await service.createPaymentIntent('user-1', dto);
    expect(res.paymentId).toBe('pay-new-1');
    expect(res.status).toBe(PaymentStatus.PENDING);
    expect(prisma.paymentAttempt.create).toHaveBeenCalled();
  });

  it('handleWebhook throws UnauthorizedException for invalid signature', async () => {
    sandboxProvider.verifyWebhook.mockResolvedValue({ valid: false });

    await expect(service.handleWebhook('{}', {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('handleWebhook returns duplicate:true for already processed event', async () => {
    sandboxProvider.verifyWebhook.mockResolvedValue({
      valid: true,
      eventId: 'evt-123',
      paymentRef: 'ref-1',
      status: 'SUCCEEDED',
    });
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-1',
      processed: true,
    });

    const res = await service.handleWebhook('{}', {});
    expect(res).toEqual({ duplicate: true });
  });

  it('handleWebhook SUCCEEDED: updates order to PAID and consumes inventory', async () => {
    sandboxProvider.verifyWebhook.mockResolvedValue({
      valid: true,
      eventId: 'evt-succ',
      paymentRef: 'ref-succ',
      status: 'SUCCEEDED',
    });
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      orderId: 'order-succ',
      userId: 'user-1',
      amountMinor: 50000,
    });
    prisma.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt-row-1' });
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'order-succ',
      status: PharmacyOrderStatus.PENDING_PAYMENT,
    });

    const res = await service.handleWebhook('{}', {});
    expect(res).toEqual({ received: true });
    expect(prisma.pharmacyOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-succ' },
      data: { status: PharmacyOrderStatus.PAID },
    });
    expect(inventoryService.consumeReservation).toHaveBeenCalledWith(
      expect.anything(),
      'order-succ',
    );
    expect(outboxService.createEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: NotificationType.PAYMENT_SUCCEEDED,
        aggregateId: 'attempt-1',
      }),
    );
  });

  it('handleWebhook FAILED: updates order to PAYMENT_FAILED and releases inventory', async () => {
    sandboxProvider.verifyWebhook.mockResolvedValue({
      valid: true,
      eventId: 'evt-fail',
      paymentRef: 'ref-fail',
      status: 'FAILED',
    });
    prisma.paymentWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.paymentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-fail',
      orderId: 'order-fail',
      userId: 'user-1',
      amountMinor: 50000,
    });
    prisma.paymentWebhookEvent.create.mockResolvedValue({ id: 'evt-row-fail' });
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'order-fail',
      status: PharmacyOrderStatus.PENDING_PAYMENT,
    });

    const res = await service.handleWebhook('{}', {});
    expect(res).toEqual({ received: true });
    expect(prisma.pharmacyOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-fail' },
      data: { status: PharmacyOrderStatus.PAYMENT_FAILED },
    });
    expect(inventoryService.releaseReservation).toHaveBeenCalledWith(
      expect.anything(),
      'order-fail',
    );
    expect(outboxService.createEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: NotificationType.PAYMENT_FAILED,
        aggregateId: 'attempt-fail',
      }),
    );
  });

  it('getPaymentStatus returns status and providerRef for valid owner', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'user-1',
      status: PaymentStatus.SUCCEEDED,
      providerRef: 'ref-123',
      amountMinor: 50000,
      currency: 'PKR',
      pharmacyOrder: {
        patient: { userId: 'user-1' },
      },
    });

    const res = await service.getPaymentStatus('user-1', 'pay-1');
    expect(res.status).toBe(PaymentStatus.SUCCEEDED);
    expect(res.providerRef).toBe('ref-123');
  });

  it('getPaymentStatus throws NotFoundException for unowned payment', async () => {
    prisma.paymentAttempt.findUnique.mockResolvedValue({
      id: 'pay-1',
      userId: 'other-user',
      pharmacyOrder: {
        patient: { userId: 'other-user' },
      },
    });

    await expect(service.getPaymentStatus('user-1', 'pay-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
