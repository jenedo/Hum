import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { supabaseAuthUserId: identifier }],
      },
      select: {
        id: true,
        supabaseAuthUserId: true,
        email: true,
        mobile: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        patientProfile: true,
        doctorProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
