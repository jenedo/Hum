import { NotFoundException } from '@nestjs/common';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

type MockPrisma = {
  notification: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: MockPrisma;

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.APPOINTMENT_BOOKED,
    titleKey: 'appointment.booked.title',
    bodyKey: 'appointment.booked.body',
    entityType: 'Appointment',
    entityId: 'app-1',
    route: '/appointments/app-1',
    dataJson: null,
    status: NotificationStatus.QUEUED,
    createdAt: new Date(),
    sentAt: null,
  };

  beforeEach(() => {
    mockPrisma = {
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new NotificationsService(mockPrisma as unknown as PrismaService);
  });

  describe('getInbox', () => {
    it('returns paginated results for correct userId', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const result = await service.getInbox('user-1', { page: 1, limit: 20 });

      expect(result).toEqual({
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 20,
        unreadCount: 1,
      });
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('filters SENT notifications when unreadOnly=true', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      await service.getInbox('user-1', { unreadOnly: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: { not: NotificationStatus.SENT },
          },
        }),
      );
    });
  });

  describe('markRead', () => {
    it('sets status to SENT for owned notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(mockNotification);
      const updatedNotification = {
        ...mockNotification,
        status: NotificationStatus.SENT,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sentAt: expect.any(Date),
      };
      mockPrisma.notification.update.mockResolvedValue(updatedNotification);

      const result = await service.markRead('user-1', 'notif-1');

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: {
            status: NotificationStatus.SENT,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            sentAt: expect.any(Date),
          },
        }),
      );
    });

    it('throws NotFoundException for unowned notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markRead('user-1', 'notif-other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('updates count correctly', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllRead('user-1');

      expect(result).toEqual({ updated: 3 });
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: NotificationStatus.QUEUED },
        data: {
          status: NotificationStatus.SENT,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          sentAt: expect.any(Date),
        },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns correct count', async () => {
      mockPrisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: NotificationStatus.QUEUED },
      });
    });
  });
});
