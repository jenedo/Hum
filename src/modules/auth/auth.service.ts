import { BadRequestException, Injectable } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { SupabasePrincipal } from '../../supabase/supabase-principal';
import { BootstrapDto } from './dto/bootstrap.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(
    principal: SupabasePrincipal,
    dto: BootstrapDto,
  ): Promise<{ user: Omit<User, 'passwordHash'> }> {
    if (dto.role === Role.ADMIN) {
      throw new BadRequestException('Cannot bootstrap ADMIN role');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { supabaseAuthUserId: principal.supabaseUserId },
          ...(principal.email
            ? [{ email: principal.email.toLowerCase() }]
            : []),
        ],
      },
      include: {
        patientProfile: true,
        doctorProfile: true,
      },
    });

    if (existing) {
      if (!existing.supabaseAuthUserId) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { supabaseAuthUserId: principal.supabaseUserId },
        });
      }
      return { user: this.sanitizeUser(existing) };
    }

    const email =
      principal.email?.toLowerCase() ??
      `${principal.supabaseUserId}@supabase.local`;

    const user = await this.prisma.user.create({
      data: {
        supabaseAuthUserId: principal.supabaseUserId,
        email,
        mobile: principal.phone ?? null,
        role: dto.role,
        ...(dto.role === Role.PATIENT
          ? {
              patientProfile: {
                create: {
                  fullName: dto.fullName || 'Patient',
                },
              },
            }
          : {
              doctorProfile: {
                create: {
                  fullName: dto.fullName || 'Doctor',
                  pmdcNumber: dto.pmdcNumber || `PMDC-${Date.now()}`,
                  specialty: dto.specialty || 'General Physician',
                },
              },
            }),
      },
      include: {
        patientProfile: true,
        doctorProfile: true,
      },
    });

    return { user: this.sanitizeUser(user) };
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...safe } = user;
    void passwordHash;
    return safe;
  }
}
