import {
  AppMode,
  DevicePlatform,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { OutboxWorkerService } from './outbox-worker.service';

type MockPrisma = {
  $queryRaw: jest.Mock;
  notification: {
    create: jest.Mock;
    update: jest.Mock;
  };
  notificationPreference: {
    upsert: jest.Mock;
  };
  deviceRegistration: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  notificationDelivery: {
    create: jest.Mock;
  };
  outboxEvent: {
    update: jest.Mock;
  };
};

type MockFirebaseAdmin = {
  sendMulticast: jest.Mock;
};

describe('OutboxWorkerService', () => {
  let service: OutboxWorkerService;
  let mockPrisma: MockPrisma;
  let mockFirebaseAdmin: MockFirebaseAdmin;

  const sampleOutboxEvent = {
    id: 'outbox-1',
    eventType: NotificationType.APPOINTMENT_BOOKED,
    aggregateType: 'Appointment',
    aggregateId: 'app-1',
    payloadJson: JSON.stringify({
      userId: 'user-1',
      titleKey: 'appointment.booked.title',
      bodyKey: 'appointment.booked.body',
      entityType: 'Appointment',
      entityId: 'app-1',
      route: '/appointments/app-1',
      data: { appRef: 'APP-123' },
    }),
    status: 'PROCESSING',
    attempts: 1,
    availableAt: new Date(),
    processedAt: null,
    createdAt: new Date(),
  };

  const sampleNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.APPOINTMENT_BOOKED,
    titleKey: 'appointment.booked.title',
    bodyKey: 'appointment.booked.body',
    entityType: 'Appointment',
    entityId: 'app-1',
    route: '/appointments/app-1',
    dataJson: JSON.stringify({ appRef: 'APP-123' }),
    status: NotificationStatus.QUEUED,
    createdAt: new Date(),
    sentAt: null,
  };

  const samplePref = {
    userId: 'user-1',
    appointmentUpdates: true,
    reminders: true,
    prescriptionUpdates: true,
    pharmacyUpdates: true,
    paymentUpdates: true,
    marketing: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: 'Asia/Karachi',
    updatedAt: new Date(),
  };

  const sampleDevice = {
    id: 'dev-1',
    userId: 'user-1',
    installationId: 'inst-1',
    fcmToken: 'fcm-token-1',
    platform: DevicePlatform.ANDROID,
    appMode: AppMode.PATIENT,
    appVersion: '1.0.0',
    enabled: true,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: null,
  };

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
      notification: {
        create: jest.fn().mockResolvedValue(sampleNotification),
        update: jest.fn().mockResolvedValue(sampleNotification),
      },
      notificationPreference: {
        upsert: jest.fn().mockResolvedValue(samplePref),
      },
      deviceRegistration: {
        findMany: jest.fn().mockResolvedValue([sampleDevice]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notificationDelivery: {
        create: jest.fn().mockResolvedValue({ id: 'deliv-1' }),
      },
      outboxEvent: {
        update: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };

    mockFirebaseAdmin = {
      sendMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        invalidTokens: [],
      }),
    };

    service = new OutboxWorkerService(
      mockPrisma as unknown as PrismaService,
      mockFirebaseAdmin as unknown as FirebaseAdminService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('processOutbox claims PENDING events and processes successfully', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);

    const processedCount = await service.processOutbox();

    expect(processedCount).toBe(1);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.APPOINTMENT_BOOKED,
      }),
    });
    expect(mockFirebaseAdmin.sendMulticast).toHaveBeenCalledWith(
      ['fcm-token-1'],
      expect.objectContaining({
        title: 'appointment.booked.title',
        body: 'appointment.booked.body',
      }),
    );
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: NotificationStatus.SENT,
      }),
    });
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: 'PROCESSED',
      }),
    });
  });

  it('disabled preference skips FCM send and marks PROCESSED', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);
    mockPrisma.notificationPreference.upsert.mockResolvedValue({
      ...samplePref,
      appointmentUpdates: false,
    });

    const processedCount = await service.processOutbox();

    expect(processedCount).toBe(1);
    expect(mockFirebaseAdmin.sendMulticast).not.toHaveBeenCalled();
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: 'PROCESSED',
      }),
    });
  });

  it('no active devices marks PROCESSED without FCM call', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);
    mockPrisma.deviceRegistration.findMany.mockResolvedValue([]);

    const processedCount = await service.processOutbox();

    expect(processedCount).toBe(1);
    expect(mockFirebaseAdmin.sendMulticast).not.toHaveBeenCalled();
    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: 'PROCESSED',
      }),
    });
  });

  it('invalid FCM tokens disable corresponding DeviceRegistration', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);
    mockFirebaseAdmin.sendMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      invalidTokens: ['fcm-token-1'],
    });

    await service.processOutbox();

    expect(mockPrisma.deviceRegistration.updateMany).toHaveBeenCalledWith({
      where: { fcmToken: { in: ['fcm-token-1'] } },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        enabled: false,
      }),
    });
  });

  it('Notification status set to SENT when all succeed', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);
    mockFirebaseAdmin.sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    });

    await service.processOutbox();

    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: NotificationStatus.SENT,
      }),
    });
  });

  it('Notification status set to PARTIAL on partial failure', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([sampleOutboxEvent]);
    mockPrisma.deviceRegistration.findMany.mockResolvedValue([
      sampleDevice,
      { ...sampleDevice, id: 'dev-2', fcmToken: 'fcm-token-2' },
    ]);
    mockFirebaseAdmin.sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      invalidTokens: ['fcm-token-2'],
    });

    await service.processOutbox();

    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: NotificationStatus.PARTIAL,
      }),
    });
  });

  it('event with attempts >= 5 goes to DEAD_LETTER on error', async () => {
    const failedEvent = { ...sampleOutboxEvent, attempts: 5 };
    mockPrisma.$queryRaw.mockResolvedValue([failedEvent]);
    mockPrisma.notification.create.mockRejectedValue(new Error('DB failure'));

    await service.processOutbox();

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: { status: 'DEAD_LETTER' },
    });
  });

  it('unhandled error sets exponential backoff availableAt', async () => {
    const failedEvent = { ...sampleOutboxEvent, attempts: 2 };
    mockPrisma.$queryRaw.mockResolvedValue([failedEvent]);
    mockPrisma.notification.create.mockRejectedValue(new Error('DB failure'));

    await service.processOutbox();

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        status: 'PENDING',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        availableAt: expect.any(Date),
      }),
    });
  });
});
