import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  DeliveryStatus,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FirebaseAdminService } from './firebase/firebase-admin.service';

type OutboxRow = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadJson: string;
  status: string;
  attempts: number;
  availableAt: Date;
  processedAt: Date | null;
  createdAt: Date;
};

type EventPayload = {
  userId: string;
  titleKey: string;
  bodyKey: string;
  entityType?: string;
  entityId?: string;
  route?: string;
  data?: Record<string, string>;
};

const NOTIFICATION_DELIVERY_BATCH_SIZE = 250;

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  onModuleInit() {
    this.intervalTimer = setInterval(() => {
      void this.processOutbox();
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  async processOutbox(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const events = await this.prisma.$queryRaw<OutboxRow[]>`
        UPDATE "OutboxEvent"
        SET status = 'PROCESSING', attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM "OutboxEvent"
          WHERE status = 'PENDING'
            AND "availableAt" <= NOW()
            AND attempts < 5
          ORDER BY "availableAt" ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `;

      if (!events || !events.length) {
        return 0;
      }

      for (const event of events) {
        try {
          await this.handleNotificationEvent(event);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Error processing OutboxEvent ${event.id}: ${errorMessage}`,
          );
          await this.handleEventFailure(event);
        }
      }

      return events.length;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Outbox worker loop error: ${errorMessage}`);
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleNotificationEvent(event: OutboxRow) {
    const payload = JSON.parse(event.payloadJson) as EventPayload;

    const notificationType = event.eventType as NotificationType;

    const notification = await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        type: notificationType,
        titleKey: payload.titleKey,
        bodyKey: payload.bodyKey,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        route: payload.route ?? null,
        dataJson: payload.data ? JSON.stringify(payload.data) : null,
        status: NotificationStatus.QUEUED,
      },
    });

    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId: payload.userId },
      create: { userId: payload.userId },
      update: {},
    });

    if (!this.isTopicEnabled(notificationType, pref)) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    if (this.isInQuietHours(pref)) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    const devices = await this.prisma.deviceRegistration.findMany({
      where: {
        userId: payload.userId,
        enabled: true,
        revokedAt: null,
      },
    });

    if (!devices.length) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      return;
    }

    const tokens = devices.map((d) => d.fcmToken);

    const fcmResult = await this.firebaseAdminService.sendMulticast(tokens, {
      title: payload.titleKey,
      body: payload.bodyKey,
      data: {
        notificationId: notification.id,
        type: event.eventType,
        entityId: payload.entityId ?? '',
        route: payload.route ?? '',
      },
    });

    let finalStatus: NotificationStatus = NotificationStatus.FAILED;
    if (fcmResult.successCount === devices.length) {
      finalStatus = NotificationStatus.SENT;
    } else if (fcmResult.successCount > 0) {
      finalStatus = NotificationStatus.PARTIAL;
    }

    const persistedAt = new Date();
    const invalidTokens = new Set(fcmResult.invalidTokens);
    const deliveryRows = devices.map((device) => ({
      notificationId: notification.id,
      deviceRegistrationId: device.id,
      status: invalidTokens.has(device.fcmToken)
        ? DeliveryStatus.FAILED
        : DeliveryStatus.ACCEPTED_BY_PROVIDER,
      sentAt: persistedAt,
    }));

    await this.prisma.$transaction(async (tx) => {
      for (
        let offset = 0;
        offset < deliveryRows.length;
        offset += NOTIFICATION_DELIVERY_BATCH_SIZE
      ) {
        await tx.notificationDelivery.createMany({
          data: deliveryRows.slice(
            offset,
            offset + NOTIFICATION_DELIVERY_BATCH_SIZE,
          ),
        });
      }

      if (fcmResult.invalidTokens.length > 0) {
        await tx.deviceRegistration.updateMany({
          where: { fcmToken: { in: fcmResult.invalidTokens } },
          data: { enabled: false, revokedAt: persistedAt },
        });
      }

      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: finalStatus,
          sentAt: persistedAt,
        },
      });

      await tx.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: persistedAt },
      });
    });
  }

  private isTopicEnabled(
    type: NotificationType,
    pref: {
      appointmentUpdates: boolean;
      reminders: boolean;
      prescriptionUpdates: boolean;
      pharmacyUpdates: boolean;
      paymentUpdates: boolean;
      marketing: boolean;
    },
  ): boolean {
    switch (type) {
      case NotificationType.APPOINTMENT_BOOKED:
      case NotificationType.APPOINTMENT_ACCEPTED:
      case NotificationType.APPOINTMENT_REJECTED:
      case NotificationType.APPOINTMENT_CANCELLED:
        return pref.appointmentUpdates;
      case NotificationType.CONSULTATION_REMINDER:
      case NotificationType.CONSULTATION_STARTED:
      case NotificationType.FOLLOW_UP_MESSAGE:
        return pref.reminders;
      case NotificationType.PRESCRIPTION_ISSUED:
      case NotificationType.PRESCRIPTION_VOIDED:
      case NotificationType.MEDICAL_RECORD_VALIDATED:
      case NotificationType.MEDICAL_RECORD_REJECTED:
        return pref.prescriptionUpdates;
      case NotificationType.PHARMACY_ORDER_PLACED:
      case NotificationType.PHARMACY_ORDER_STATUS_CHANGED:
        return pref.pharmacyUpdates;
      case NotificationType.PAYMENT_SUCCEEDED:
      case NotificationType.PAYMENT_FAILED:
      case NotificationType.WALLET_CREDITED:
      case NotificationType.WALLET_DEBITED:
        return pref.paymentUpdates;
      default:
        return true;
    }
  }

  private isInQuietHours(pref: {
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
  }): boolean {
    if (pref.quietHoursStart === null || pref.quietHoursEnd === null) {
      return false;
    }

    const currentHour = new Date().getHours();
    const start = pref.quietHoursStart;
    const end = pref.quietHoursEnd;

    if (start <= end) {
      return currentHour >= start && currentHour < end;
    }
    return currentHour >= start || currentHour < end;
  }

  private async handleEventFailure(event: OutboxRow) {
    if (event.attempts >= 5) {
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'DEAD_LETTER' },
      });
    } else {
      const backoffSeconds = event.attempts * event.attempts * 30;
      const availableAt = new Date(Date.now() + backoffSeconds * 1000);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PENDING',
          availableAt,
        },
      });
    }
  }
}
