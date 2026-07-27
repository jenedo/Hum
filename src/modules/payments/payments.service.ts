import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PharmacyOrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OutboxEventService } from '../notifications/outbox-event.service';
import { PharmacyInventoryService } from '../pharmacy/pharmacy-inventory.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxProvider: SandboxPaymentProvider,
    private readonly inventoryService: PharmacyInventoryService,
    private readonly outboxService: OutboxEventService,
  ) {}

  async createPaymentIntent(userId: string, dto: CreatePaymentIntentDto) {
    const existing = await this.prisma.paymentAttempt.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing && existing.status !== PaymentStatus.FAILED) {
      return {
        paymentId: existing.id,
        redirectUrl: existing.providerRef
          ? `https://sandbox.asaancare.pk/pay/${existing.providerRef}`
          : undefined,
        status: existing.status,
        providerRef: existing.providerRef,
      };
    }

    const order = await this.prisma.pharmacyOrder.findUnique({
      where: { id: dto.orderId },
      include: { patient: true },
    });

    if (!order || order.patient.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== PharmacyOrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not in PENDING_PAYMENT status');
    }

    const intent = await this.sandboxProvider.createPaymentIntent(
      order.id,
      order.totalMinor,
      order.currency,
      dto.idempotencyKey,
    );

    const attempt = await this.prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        userId,
        provider: dto.provider || PaymentProvider.SANDBOX,
        status: PaymentStatus.PENDING,
        amountMinor: order.totalMinor,
        currency: order.currency,
        providerRef: intent.providerRef,
        providerResponse: intent.rawResponse,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    return {
      paymentId: attempt.id,
      redirectUrl: intent.redirectUrl,
      status: attempt.status,
      providerRef: attempt.providerRef,
    };
  }

  async handleWebhook(rawBody: string, headers: Record<string, string>) {
    const verification = await this.sandboxProvider.verifyWebhook(
      rawBody,
      headers,
    );

    if (!verification.valid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (verification.eventId) {
      const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
        where: { eventId: verification.eventId },
      });

      if (existingEvent && existingEvent.processed) {
        return { duplicate: true };
      }
    }

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerRef: verification.paymentRef },
    });

    if (!attempt) {
      this.logger.warn(
        `PaymentAttempt not found for providerRef: ${verification.paymentRef}`,
      );
      return { received: true };
    }

    const newStatus =
      verification.status === 'SUCCEEDED'
        ? PaymentStatus.SUCCEEDED
        : verification.status === 'FAILED'
          ? PaymentStatus.FAILED
          : PaymentStatus.PROCESSING;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let webhookEvent = await tx.paymentWebhookEvent.findUnique({
        where: { eventId: verification.eventId },
      });

      if (!webhookEvent) {
        webhookEvent = await tx.paymentWebhookEvent.create({
          data: {
            paymentAttemptId: attempt.id,
            provider: PaymentProvider.SANDBOX,
            eventId: verification.eventId,
            payloadJson:
              typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
            signatureValid: true,
            processed: false,
          },
        });
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: newStatus },
      });

      if (attempt.orderId) {
        const order = await tx.pharmacyOrder.findUnique({
          where: { id: attempt.orderId },
        });

        if (order) {
          if (newStatus === PaymentStatus.SUCCEEDED) {
            await tx.pharmacyOrder.update({
              where: { id: order.id },
              data: { status: PharmacyOrderStatus.PAID },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: PharmacyOrderStatus.PAID,
                note: 'Payment succeeded via sandbox webhook',
              },
            });

            await this.inventoryService.consumeReservation(tx, order.id);

            await this.outboxService.createEvent(tx, {
              eventType: NotificationType.PAYMENT_SUCCEEDED,
              aggregateType: 'PaymentAttempt',
              aggregateId: attempt.id,
              userId: attempt.userId,
              titleKey: 'payment.succeeded.title',
              bodyKey: 'payment.succeeded.body',
              entityType: 'PharmacyOrder',
              entityId: order.id,
            });
          } else if (newStatus === PaymentStatus.FAILED) {
            await tx.pharmacyOrder.update({
              where: { id: order.id },
              data: { status: PharmacyOrderStatus.PAYMENT_FAILED },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: PharmacyOrderStatus.PAYMENT_FAILED,
                note: 'Payment failed via sandbox webhook',
              },
            });

            await this.inventoryService.releaseReservation(tx, order.id);

            await this.outboxService.createEvent(tx, {
              eventType: NotificationType.PAYMENT_FAILED,
              aggregateType: 'PaymentAttempt',
              aggregateId: attempt.id,
              userId: attempt.userId,
              titleKey: 'payment.failed.title',
              bodyKey: 'payment.failed.body',
              entityType: 'PharmacyOrder',
              entityId: order.id,
            });
          }
        }
      }

      await tx.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    });

    return { received: true };
  }

  async getPaymentStatus(userId: string, paymentId: string) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: paymentId },
      include: {
        pharmacyOrder: {
          include: { patient: true },
        },
      },
    });

    if (
      !attempt ||
      (attempt.userId !== userId &&
        attempt.pharmacyOrder?.patient?.userId !== userId)
    ) {
      throw new NotFoundException('Payment attempt not found');
    }

    return {
      id: attempt.id,
      status: attempt.status,
      providerRef: attempt.providerRef,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
    };
  }
}
