import { NotificationType, OutboxStatus, Prisma } from '@prisma/client';
import { OutboxEventService } from './outbox-event.service';

describe('OutboxEventService', () => {
  let service: OutboxEventService;
  let mockTx: { outboxEvent: { create: jest.Mock } };

  beforeEach(() => {
    service = new OutboxEventService();
    mockTx = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };
  });

  it('createEvent inserts OutboxEvent with correct eventType', async () => {
    await service.createEvent(mockTx as unknown as Prisma.TransactionClient, {
      eventType: NotificationType.APPOINTMENT_BOOKED,
      aggregateType: 'Appointment',
      aggregateId: 'app-1',
      userId: 'user-1',
      titleKey: 'notification.appointment.booked.title',
      bodyKey: 'notification.appointment.booked.body',
      entityType: 'Appointment',
      entityId: 'app-1',
      route: '/appointments/app-1',
    });

    expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        eventType: NotificationType.APPOINTMENT_BOOKED,
        aggregateType: 'Appointment',
        aggregateId: 'app-1',
        status: OutboxStatus.PENDING,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        availableAt: expect.any(Date),
      }),
    });
  });

  it('createEvent payloadJson contains userId, titleKey, bodyKey, route', async () => {
    await service.createEvent(mockTx as unknown as Prisma.TransactionClient, {
      eventType: NotificationType.PRESCRIPTION_ISSUED,
      aggregateType: 'Prescription',
      aggregateId: 'rx-1',
      userId: 'patient-123',
      titleKey: 'notification.prescription.issued.title',
      bodyKey: 'notification.prescription.issued.body',
      entityType: 'Prescription',
      entityId: 'rx-1',
      route: '/prescriptions/rx-1',
    });

    const calls = mockTx.outboxEvent.create.mock.calls as Array<
      [{ data: { payloadJson: string } }]
    >;
    const callArg = calls[0][0];
    const parsedPayload = JSON.parse(callArg.data.payloadJson) as Record<
      string,
      unknown
    >;

    expect(parsedPayload).toEqual({
      userId: 'patient-123',
      titleKey: 'notification.prescription.issued.title',
      bodyKey: 'notification.prescription.issued.body',
      entityType: 'Prescription',
      entityId: 'rx-1',
      route: '/prescriptions/rx-1',
    });
  });

  it('createEvent payloadJson does NOT contain clinical fields', async () => {
    await service.createEvent(mockTx as unknown as Prisma.TransactionClient, {
      eventType: NotificationType.PRESCRIPTION_ISSUED,
      aggregateType: 'Prescription',
      aggregateId: 'rx-1',
      userId: 'patient-123',
      titleKey: 'notification.prescription.issued.title',
      bodyKey: 'notification.prescription.issued.body',
      route: '/prescriptions/rx-1',
    });

    const calls = mockTx.outboxEvent.create.mock.calls as Array<
      [{ data: { payloadJson: string } }]
    >;
    const callArg = calls[0][0];
    const payloadJsonStr = callArg.data.payloadJson;

    expect(payloadJsonStr).not.toContain('diagnosis');
    expect(payloadJsonStr).not.toContain('medicine');
    expect(payloadJsonStr).not.toContain('dosage');
    expect(payloadJsonStr).not.toContain('instructions');
  });

  it('createEvent uses provided transaction (not a new prisma call)', async () => {
    const customTx = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-custom' }),
      },
    };

    await service.createEvent(customTx as unknown as Prisma.TransactionClient, {
      eventType: NotificationType.APPOINTMENT_ACCEPTED,
      aggregateType: 'Appointment',
      aggregateId: 'app-2',
      userId: 'user-2',
      titleKey: 'notification.title',
      bodyKey: 'notification.body',
    });

    expect(customTx.outboxEvent.create).toHaveBeenCalled();
    expect(mockTx.outboxEvent.create).not.toHaveBeenCalled();
  });
});
