import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import type { SupabasePrincipal } from '../../supabase/supabase-principal';
import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_COST = 12;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ user: Omit<User, 'passwordHash'> }> {
    if (dto.role !== Role.PATIENT && dto.role !== Role.DOCTOR) {
      throw new BadRequestException('Only PATIENT or DOCTOR may register');
    }

    if (dto.role === Role.DOCTOR) {
      if (!dto.pmdcNumber || !dto.specialty) {
        throw new BadRequestException(
          'pmdcNumber and specialty are required for DOCTOR registration',
        );
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    if (dto.mobile) {
      const mobileTaken = await this.prisma.user.findUnique({
        where: { mobile: dto.mobile },
      });
      if (mobileTaken) {
        throw new ConflictException('Mobile is already registered');
      }
    }

    if (dto.role === Role.DOCTOR && dto.pmdcNumber) {
      const pmdcTaken = await this.prisma.doctorProfile.findUnique({
        where: { pmdcNumber: dto.pmdcNumber },
      });
      if (pmdcTaken) {
        throw new ConflictException('PMDC number is already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            mobile: dto.mobile,
            passwordHash,
            role: dto.role,
          },
        });

        if (dto.role === Role.PATIENT) {
          await tx.patientProfile.create({
            data: {
              userId: created.id,
              fullName: dto.fullName,
              dateOfBirth: dto.dateOfBirth
                ? new Date(dto.dateOfBirth)
                : undefined,
              gender: dto.gender,
            },
          });
        } else {
          await tx.doctorProfile.create({
            data: {
              userId: created.id,
              fullName: dto.fullName,
              pmdcNumber: dto.pmdcNumber!,
              specialty: dto.specialty!,
            },
          });
        }

        return created;
      },
    );

    return { user: this.sanitizeUser(user) };
  }

  async login(
    dto: LoginDto,
  ): Promise<AuthTokens & { user: Omit<User, 'passwordHash'> }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const { tokenId, secret } = this.parseRefreshToken(rawRefreshToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const secretOk = await bcrypt.compare(secret, existing.tokenHash);
    if (!secretOk) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!existing.user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(existing.user);
  }

  async logout(rawRefreshToken: string): Promise<{ success: true }> {
    const { tokenId, secret } = this.parseRefreshToken(rawRefreshToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const secretOk = await bcrypt.compare(secret, existing.tokenHash);
    if (!secretOk) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!existing.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const secret = randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(secret, BCRYPT_COST);
    const expiresAt = this.computeRefreshExpiry();

    const refreshRow = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: `${refreshRow.id}.${secret}`,
      expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRY'),
    };
  }

  parseRefreshToken(raw: string): { tokenId: string; secret: string } {
    const separator = raw.indexOf('.');
    if (separator <= 0 || separator === raw.length - 1) {
      throw new UnauthorizedException('Malformed refresh token');
    }

    return {
      tokenId: raw.slice(0, separator),
      secret: raw.slice(separator + 1),
    };
  }

  private computeRefreshExpiry(): Date {
    const raw = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRY');
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) {
      throw new BadRequestException('Invalid JWT_REFRESH_EXPIRY format');
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return new Date(Date.now() + amount * multipliers[unit]);
  }

  async bootstrap(
    principal: SupabasePrincipal,
    dto: BootstrapDto,
  ): Promise<{ user: Omit<User, 'passwordHash'> }> {
    if (dto.role === Role.ADMIN || dto.role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Cannot bootstrap ADMIN or SUPER_ADMIN role',
      );
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
