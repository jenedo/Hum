import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { CorrelationIdMiddleware } from '../src/common/middleware/correlation-id.middleware';
import { PrismaService } from '../src/database/prisma.service';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { DoctorsService } from '../src/modules/doctors/doctors.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { IS_PUBLIC_KEY } from '../src/security/decorators/public.decorator';
import { SupabaseAuthGuard } from '../src/supabase/supabase-auth.guard';
import { SupabaseClaimsVerifier } from '../src/supabase/supabase-claims.verifier';

interface CorrelatedAuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  supabasePrincipal?: {
    supabaseUserId: string;
    email: string;
  };
  user?: {
    userId: string;
    role: Role;
  };
}

interface ApiSuccessResponse<T> {
  success: boolean;
  data: T;
  correlationId: string;
  timestamp: string;
}

interface ApiErrorResponse {
  success: boolean;
  message?: string | string[];
  statusCode?: number;
}

interface DoctorResponseItem {
  id: string;
  fullName: string;
  specialty: string;
  isVerified: boolean;
}

interface WalletData {
  id: string;
  balanceMinor: number;
  currency: string;
}

describe('Read-Only Endpoints (e2e)', () => {
  let app: INestApplication;
  let reflector: Reflector;

  const mockPrismaService = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'user_e2e_123',
        role: Role.PATIENT,
        isActive: true,
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'user_e2e_123',
        role: Role.PATIENT,
        isActive: true,
      }),
    },
    doctorProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'doc_prof_123',
        userId: 'user_e2e_123',
      }),
    },
    patientProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pat_prof_123',
        userId: 'user_e2e_123',
      }),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockDoctorsService = {
    listVerified: jest.fn().mockResolvedValue([
      {
        id: 'doc_1',
        fullName: 'Dr. Test Specialist',
        specialty: 'Cardiology',
        isVerified: true,
      },
    ]),
  };

  const mockAppointmentsService = {
    getUserAppointments: jest.fn().mockResolvedValue([
      {
        id: 'app_1',
        status: 'PENDING',
        slotStart: new Date().toISOString(),
      },
    ]),
  };

  const mockWalletService = {
    getWallet: jest.fn().mockResolvedValue({
      id: 'wallet_1',
      balanceMinor: 50000,
      currency: 'PKR',
    }),
  };

  const mockPaymentsService = {
    createPaymentIntent: jest.fn(),
  };

  const mockSupabaseClaimsVerifier = {
    verifyAccessToken: jest.fn().mockImplementation((token: string) => {
      if (token === 'mock-valid-token') {
        return Promise.resolve({
          supabaseUserId: 'user_e2e_123',
          email: 'test@asaancare.pk',
        });
      }
      return Promise.reject(
        new UnauthorizedException('Missing or invalid bearer token'),
      );
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(SupabaseClaimsVerifier)
      .useValue(mockSupabaseClaimsVerifier)
      .overrideProvider(DoctorsService)
      .useValue(mockDoctorsService)
      .overrideProvider(AppointmentsService)
      .useValue(mockAppointmentsService)
      .overrideProvider(WalletService)
      .useValue(mockWalletService)
      .overrideProvider(PaymentsService)
      .useValue(mockPaymentsService)
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const handler = context.getHandler();
          const targetClass = context.getClass();
          if (reflector) {
            const isPublic = reflector.getAllAndOverride<boolean>(
              IS_PUBLIC_KEY,
              [handler, targetClass],
            );
            if (isPublic) return true;
          }

          const req = context
            .switchToHttp()
            .getRequest<CorrelatedAuthenticatedRequest>();
          const authHeader = req.headers['authorization'];
          if (!authHeader || typeof authHeader !== 'string') {
            throw new UnauthorizedException('Missing or invalid bearer token');
          }
          const match = /^Bearer (.+)$/.exec(authHeader);
          if (!match) {
            throw new UnauthorizedException('Missing or invalid bearer token');
          }
          const token = match[1];
          if (token === 'mock-valid-token') {
            req.supabasePrincipal = {
              supabaseUserId: 'user_e2e_123',
              email: 'test@asaancare.pk',
            };
            req.user = {
              userId: 'user_e2e_123',
              role: Role.PATIENT,
            };
            return true;
          }
          throw new UnauthorizedException('Missing or invalid bearer token');
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    reflector = app.get(Reflector);
    const correlationIdMiddleware = new CorrelationIdMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      correlationIdMiddleware.use(req, res, next),
    );
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/doctors', () => {
    it('returns 200 with doctor array', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/v1/doctors')
        .expect(200);

      const body = response.body as ApiSuccessResponse<DoctorResponseItem[]>;
      expect(body).toHaveProperty('success', true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0]).toHaveProperty('id', 'doc_1');
    });
  });

  describe('GET /api/v1/appointments', () => {
    it('returns 401 when authorization header is missing', async () => {
      await request(app.getHttpServer() as App)
        .get('/api/v1/appointments')
        .expect(401);
    });

    it('returns 200 with appointments when valid bearer token is provided', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/v1/appointments')
        .set('Authorization', 'Bearer mock-valid-token')
        .expect(200);

      const body = response.body as ApiSuccessResponse<unknown[]>;
      expect(body).toHaveProperty('success', true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/wallet', () => {
    it('returns 401 when authorization header is missing', async () => {
      await request(app.getHttpServer() as App)
        .get('/api/v1/wallet')
        .expect(401);
    });

    it('returns 200 with wallet data when valid bearer token is provided', async () => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/v1/wallet')
        .set('Authorization', 'Bearer mock-valid-token')
        .expect(200);

      const body = response.body as ApiSuccessResponse<WalletData>;
      expect(body).toHaveProperty('success', true);
      expect(body.data).toHaveProperty('balanceMinor', 50000);
    });
  });

  describe('POST /api/v1/payments/intent', () => {
    it('returns 400 Bad Request when body is missing required fields', async () => {
      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/payments/intent')
        .set('Authorization', 'Bearer mock-valid-token')
        .send({})
        .expect(400);

      const body = response.body as ApiErrorResponse;
      expect(body).toHaveProperty('success', false);
      expect(mockPaymentsService.createPaymentIntent).not.toHaveBeenCalled();
    });
  });
});
