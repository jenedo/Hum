import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DeviceRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceRegistration.upsert({
      where: {
        userId_installationId_appMode: {
          userId,
          installationId: dto.installationId,
          appMode: dto.appMode,
        },
      },
      create: {
        userId,
        installationId: dto.installationId,
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        appMode: dto.appMode,
        appVersion: dto.appVersion,
        enabled: true,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      update: {
        fcmToken: dto.fcmToken,
        platform: dto.platform,
        appVersion: dto.appVersion,
        enabled: true,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    });
  }

  async revokeDevice(userId: string, deviceId: string) {
    const device = await this.prisma.deviceRegistration.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException(
        'Device registration not found or not owned by user',
      );
    }

    return this.prisma.deviceRegistration.update({
      where: { id: deviceId },
      data: {
        enabled: false,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllForUser(userId: string) {
    return this.prisma.deviceRegistration.updateMany({
      where: { userId },
      data: {
        enabled: false,
        revokedAt: new Date(),
      },
    });
  }

  async getActiveDevices(userId: string) {
    return this.prisma.deviceRegistration.findMany({
      where: {
        userId,
        enabled: true,
        revokedAt: null,
      },
    });
  }
}
