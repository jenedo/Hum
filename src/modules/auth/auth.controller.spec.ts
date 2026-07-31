import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import type { SupabaseAuthenticatedRequest } from '../../supabase/supabase-principal';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const request = {
    supabasePrincipal: {
      supabaseUserId: 'supabase-user-id',
      sessionId: 'session-id',
      email: 'patient@example.com',
    },
  } as unknown as SupabaseAuthenticatedRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { bootstrap: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('GET /me returns userId, email, and role from request context', () => {
    const user: AuthUser = {
      userId: 'database-user-id',
      role: Role.PATIENT,
    };

    expect(controller.getMe(user, request)).toEqual({
      userId: 'database-user-id',
      email: 'patient@example.com',
      role: Role.PATIENT,
    });
  });

  it('POST /logout returns 204 with no body', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.logout)).toBe(
      HttpStatus.NO_CONTENT,
    );
    expect(controller.logout()).toBeUndefined();
  });

  it('GET /me with missing user throws UnauthorizedException', () => {
    expect(() => controller.getMe(undefined, request)).toThrow(
      UnauthorizedException,
    );
  });
});
