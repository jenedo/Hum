import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    if (
      dto.quietHoursStart !== undefined &&
      (dto.quietHoursStart < 0 || dto.quietHoursStart > 23)
    ) {
      throw new BadRequestException('quietHoursStart must be between 0 and 23');
    }
    if (
      dto.quietHoursEnd !== undefined &&
      (dto.quietHoursEnd < 0 || dto.quietHoursEnd > 23)
    ) {
      throw new BadRequestException('quietHoursEnd must be between 0 and 23');
    }

    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: {
        ...dto,
      },
    });
  }
}
