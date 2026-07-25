import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVerified(specialty?: string) {
    const trimmedSpecialty = specialty?.trim();

    return this.prisma.doctorProfile.findMany({
      where: {
        isVerified: true,
        ...(trimmedSpecialty
          ? { specialty: { equals: trimmedSpecialty, mode: 'insensitive' } }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        specialty: true,
        pmdcNumber: true,
        isVerified: true,
        user: {
          select: {
            email: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async getVerifiedById(id: string) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: {
        id: id.trim(),
        isVerified: true,
      },
      select: {
        id: true,
        fullName: true,
        specialty: true,
        pmdcNumber: true,
        isVerified: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Verified doctor not found');
    }

    return doctor;
  }
}
