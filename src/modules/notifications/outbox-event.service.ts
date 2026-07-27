import { Injectable } from '@nestjs/common';
import { NotificationType, OutboxStatus, Prisma } from '@prisma/client';

export type OutboxPayload = {
  eventType: NotificationType;
  aggregateType: string;
  aggregateId: string;
  userId: string;
  titleKey: string;
  bodyKey: string;
  entityType?: string;
  entityId?: string;
  route?: string;
  extraData?: Record<string, string>;
};

@Injectable()
export class OutboxEventService {
  async createEvent(
    tx: Prisma.TransactionClient,
    payload: OutboxPayload,
  ): Promise<void> {
    const payloadObject: Record<string, unknown> = {
      userId: payload.userId,
      titleKey: payload.titleKey,
      bodyKey: payload.bodyKey,
      entityType: payload.entityType,
      entityId: payload.entityId,
      route: payload.route,
      ...payload.extraData,
    };

    await tx.outboxEvent.create({
      data: {
        eventType: payload.eventType,
        aggregateType: payload.aggregateType,
        aggregateId: payload.aggregateId,
        payloadJson: JSON.stringify(payloadObject),
        status: OutboxStatus.PENDING,
        availableAt: new Date(),
      },
    });
  }
}
