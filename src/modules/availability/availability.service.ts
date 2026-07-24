import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async createForCurrentDoctor(userId: string, dto: CreateAvailabilityDto) {
    if (dto.endMinutes <= dto.startMinutes) {
      throw new BadRequestException(
        'endMinutes must be greater than startMinutes',
      );
    }

    const windowLength = dto.endMinutes - dto.startMinutes;
    if (windowLength % dto.slotDurationMinutes !== 0) {
      throw new BadRequestException(
        'Availability window length must be evenly divisible by slotDurationMinutes',
      );
    }

    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const existing = await this.prisma.doctorAvailability.findMany({
      where: {
        doctorProfileId: doctor.id,
        dayOfWeek: dto.dayOfWeek,
        isActive: true,
      },
    });

    const overlaps = existing.some(
      (slot) =>
        dto.startMinutes < slot.endMinutes &&
        dto.endMinutes > slot.startMinutes,
    );

    if (overlaps) {
      throw new BadRequestException(
        'Availability overlaps an existing active slot for this day',
      );
    }

    return this.prisma.doctorAvailability.create({
      data: {
        doctorProfileId: doctor.id,
        dayOfWeek: dto.dayOfWeek,
        startMinutes: dto.startMinutes,
        endMinutes: dto.endMinutes,
        slotDurationMinutes: dto.slotDurationMinutes,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listPublic(doctorProfileId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
    });

    if (!doctor || !doctor.isVerified) {
      throw new NotFoundException('Verified doctor not found');
    }

    return this.prisma.doctorAvailability.findMany({
      where: {
        doctorProfileId,
        isActive: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }],
    });
  }
}
