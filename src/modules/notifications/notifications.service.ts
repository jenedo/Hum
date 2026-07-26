import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInbox(userId: string, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(query.unreadOnly ? { status: { not: NotificationStatus.SENT } } : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, status: NotificationStatus.QUEUED },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found or not owned by user',
      );
    }

    if (notification.status === NotificationStatus.QUEUED) {
      return this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    }

    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, status: NotificationStatus.QUEUED },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, status: NotificationStatus.QUEUED },
    });
    return { count };
  }
}
