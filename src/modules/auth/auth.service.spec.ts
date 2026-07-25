import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    doctorProfile: { findUnique: jest.Mock };
    patientProfile: { create: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };

  const baseUser: User = {
    id: 'user-1',
    supabaseAuthUserId: null,
    email: 'patient@example.com',
    mobile: null,
    passwordHash: '',
    role: Role.PATIENT,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      doctorProfile: {
        findUnique: jest.fn(),
      },
      patientProfile: {
        create: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('access.jwt.token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_EXPIRY: '15m',
                JWT_REFRESH_EXPIRY: '30d',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('hashes passwords with bcrypt cost factor 12', async () => {
    const hash = await service.hashPassword('Password1!');
    expect(hash).not.toEqual('Password1!');
    expect(await bcrypt.compare('Password1!', hash)).toBe(true);
    // bcrypt cost is encoded in the hash as $2a$12$ or $2b$12$
    expect(hash).toMatch(/^\$2[aby]?\$12\$/);
  });

  it('generates an access JWT with sub and role', async () => {
    prisma.refreshToken.create.mockResolvedValue({
      id: 'rt-1',
      userId: baseUser.id,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const tokens = await service.issueTokens(baseUser);

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: baseUser.id,
      role: baseUser.role,
    });
    expect(tokens.accessToken).toBe('access.jwt.token');
    expect(tokens.refreshToken).toMatch(/^rt-1\./);
    expect(tokens.expiresIn).toBe('15m');
  });

  it('rotates refresh tokens by revoking the old one and issuing a new pair', async () => {
    const secret = 'super-secret-refresh-value';
    const tokenHash = await bcrypt.hash(secret, 12);
    const raw = `rt-old.${secret}`;

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-old',
      userId: baseUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      user: baseUser,
    });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({
      id: 'rt-new',
      userId: baseUser.id,
      tokenHash: 'new-hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    const tokens = await service.refresh(raw);

    expect(prisma.refreshToken.update).toHaveBeenCalledTimes(1);
    // Jest mock.calls is typed loosely; cast for lint safety.
    const updateCalls = prisma.refreshToken.update.mock.calls as Array<
      [{ where: { id: string }; data: { revokedAt: Date } }]
    >;
    const updateArg = updateCalls[0][0];
    expect(updateArg.where.id).toBe('rt-old');
    expect(updateArg.data.revokedAt).toBeInstanceOf(Date);
    expect(tokens.refreshToken.startsWith('rt-new.')).toBe(true);
    expect(tokens.accessToken).toBe('access.jwt.token');
  });

  it('rejects expired refresh tokens', async () => {
    const secret = 'expired-secret';
    const tokenHash = await bcrypt.hash(secret, 12);

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-expired',
      userId: baseUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      createdAt: new Date(),
      user: baseUser,
    });

    await expect(
      service.refresh(`rt-expired.${secret}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects revoked refresh tokens', async () => {
    const secret = 'revoked-secret';
    const tokenHash = await bcrypt.hash(secret, 12);

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-revoked',
      userId: baseUser.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      user: baseUser,
    });

    await expect(
      service.refresh(`rt-revoked.${secret}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects reuse of a refresh token after rotation', async () => {
    const secret = 'once-only';
    const tokenHash = await bcrypt.hash(secret, 12);
    const raw = `rt-once.${secret}`;

    prisma.refreshToken.findUnique
      .mockResolvedValueOnce({
        id: 'rt-once',
        userId: baseUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        createdAt: new Date(),
        user: baseUser,
      })
      .mockResolvedValueOnce({
        id: 'rt-once',
        userId: baseUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
        createdAt: new Date(),
        user: baseUser,
      });

    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({
      id: 'rt-next',
      userId: baseUser.id,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
    });

    await service.refresh(raw);
    await expect(service.refresh(raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
