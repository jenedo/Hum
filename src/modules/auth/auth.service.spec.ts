import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  const baseUser: User = {
    id: 'user-1',
    supabaseAuthUserId: 'sub-123',
    email: 'patient@example.com',
    mobile: null,
    passwordHash: null,
    role: Role.PATIENT,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rejects bootstrapping ADMIN role', async () => {
    await expect(
      service.bootstrap(
        { supabaseUserId: 'sub-1', email: 'admin@local', sessionId: 'sess-1' },
        { role: Role.ADMIN },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links existing user with Supabase ID and strips passwordHash from return', async () => {
    prisma.user.findFirst.mockResolvedValue(baseUser);

    const res = await service.bootstrap(
      {
        supabaseUserId: 'sub-123',
        email: 'patient@example.com',
        sessionId: 'sess-123',
      },
      { role: Role.PATIENT },
    );

    expect(res.user.id).toBe('user-1');
    expect(res.user).not.toHaveProperty('passwordHash');
  });

  it('creates new patient profile during bootstrap if user does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(baseUser);

    const res = await service.bootstrap(
      {
        supabaseUserId: 'sub-123',
        email: 'patient@example.com',
        sessionId: 'sess-123',
      },
      { role: Role.PATIENT, fullName: 'John Doe' },
    );

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(res.user.id).toBe('user-1');
    expect(res.user).not.toHaveProperty('passwordHash');
  });
});
