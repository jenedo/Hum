import { NotFoundException } from '@nestjs/common';
import { AppMode, DevicePlatform } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DeviceRegistrationsService } from './device-registrations.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

type MockPrisma = {
  deviceRegistration: {
    upsert: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

describe('DeviceRegistrationsService', () => {
  let service: DeviceRegistrationsService;
  let mockPrisma: MockPrisma;

  const mockDevice = {
    id: 'device-1',
    userId: 'user-1',
    installationId: 'install-1',
    fcmToken: 'token-123',
    platform: DevicePlatform.ANDROID,
    appMode: AppMode.PATIENT,
    appVersion: '1.0.0',
    enabled: true,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: null,
  };

  const registerDto: RegisterDeviceDto = {
    installationId: 'install-1',
    fcmToken: 'token-123',
    platform: DevicePlatform.ANDROID,
    appMode: AppMode.PATIENT,
    appVersion: '1.0.0',
  };

  beforeEach(() => {
    mockPrisma = {
      deviceRegistration: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new DeviceRegistrationsService(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('upsertDevice', () => {
    it('creates or updates device registration', async () => {
      mockPrisma.deviceRegistration.upsert.mockResolvedValue(mockDevice);

      const result = await service.upsertDevice('user-1', registerDto);

      expect(result).toEqual(mockDevice);
      expect(mockPrisma.deviceRegistration.upsert).toHaveBeenCalledWith({
        where: {
          userId_installationId_appMode: {
            userId: 'user-1',
            installationId: 'install-1',
            appMode: AppMode.PATIENT,
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          userId: 'user-1',
          installationId: 'install-1',
          fcmToken: 'token-123',
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        update: expect.objectContaining({
          fcmToken: 'token-123',
          enabled: true,
        }),
      });
    });
  });

  describe('revokeDevice', () => {
    it('sets enabled=false for owned device', async () => {
      mockPrisma.deviceRegistration.findFirst.mockResolvedValue(mockDevice);
      const revokedDevice = {
        ...mockDevice,
        enabled: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        revokedAt: expect.any(Date),
      };
      mockPrisma.deviceRegistration.update.mockResolvedValue(revokedDevice);

      const result = await service.revokeDevice('user-1', 'device-1');

      expect(result.enabled).toBe(false);
      expect(mockPrisma.deviceRegistration.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: {
          enabled: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          revokedAt: expect.any(Date),
        },
      });
    });

    it('throws NotFoundException for unowned device', async () => {
      mockPrisma.deviceRegistration.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeDevice('user-1', 'device-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all user devices', async () => {
      mockPrisma.deviceRegistration.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.revokeAllForUser('user-1');

      expect(result).toEqual({ count: 2 });
      expect(mockPrisma.deviceRegistration.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: {
          enabled: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          revokedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getActiveDevices', () => {
    it('returns only enabled non-revoked devices', async () => {
      mockPrisma.deviceRegistration.findMany.mockResolvedValue([mockDevice]);

      const result = await service.getActiveDevices('user-1');

      expect(result).toEqual([mockDevice]);
      expect(mockPrisma.deviceRegistration.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          enabled: true,
          revokedAt: null,
        },
      });
    });
  });
});
