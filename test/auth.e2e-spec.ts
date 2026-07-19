import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
  user?: {
    email: string;
    passwordHash?: string;
  };
};

type MeResponse = {
  email: string;
  patientProfile: {
    fullName: string;
  };
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const patientEmail = `patient-${Date.now()}@example.com`;
  const password = 'Password1!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.appointment.deleteMany({});
        await prisma.doctorAvailability.deleteMany({});
        await prisma.doctorDocument.deleteMany({});
        await prisma.doctorVerification.deleteMany({});
        await prisma.auditLog.deleteMany({});
        await prisma.refreshToken.deleteMany({});
        await prisma.patientProfile.deleteMany({});
        await prisma.doctorProfile.deleteMany({});
        // Keep ADMIN users so prisma seed remains usable
        await prisma.user.deleteMany({
          where: { role: { in: [Role.PATIENT, Role.DOCTOR] } },
        });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('register → login → refresh → logout flow', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: patientEmail,
        password,
        role: Role.PATIENT,
        fullName: 'Test Patient',
        gender: 'male',
      })
      .expect(201);

    const registerBody = registerRes.body as AuthResponse;
    expect(registerBody.user?.email).toBe(patientEmail);
    expect(registerBody.user?.passwordHash).toBeUndefined();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: patientEmail, password })
      .expect(200);

    const loginBody = loginRes.body as AuthResponse;
    expect(loginBody.accessToken).toBeDefined();
    expect(loginBody.refreshToken).toContain('.');

    const firstRefresh = loginBody.refreshToken;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefresh })
      .expect(200);

    const refreshBody = refreshRes.body as AuthResponse;
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.refreshToken).not.toBe(firstRefresh);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(401);
  });

  it('rejects duplicate email registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: patientEmail,
        password,
        role: Role.PATIENT,
        fullName: 'Duplicate Patient',
      })
      .expect(409);
  });

  it('rejects wrong password on login', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: patientEmail, password: 'WrongPass1!' })
      .expect(401);
  });

  it('rejects expired refresh tokens', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: patientEmail, password })
      .expect(200);

    const loginBody = loginRes.body as AuthResponse;
    const raw = loginBody.refreshToken;
    const tokenId = raw.split('.')[0];

    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: raw })
      .expect(401);
  });

  it('rejects revoked refresh tokens', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: patientEmail, password })
      .expect(200);

    const loginBody = loginRes.body as AuthResponse;
    const raw = loginBody.refreshToken;
    const tokenId = raw.split('.')[0];

    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: raw })
      .expect(401);
  });

  it('GET /users/me returns authenticated profile from JWT', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: patientEmail, password })
      .expect(200);

    const loginBody = loginRes.body as AuthResponse;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);

    const meBody = meRes.body as MeResponse;
    expect(meBody.email).toBe(patientEmail);
    expect(meBody.patientProfile.fullName).toBe('Test Patient');
  });
});
