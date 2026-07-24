import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationType, Role, VerificationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
};

type AppointmentResponse = {
  id: string;
  status: string;
};

describe('Appointments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'Password1!';
  const stamp = Date.now();

  let doctorProfileId: string;
  let patientAToken: string;
  let patientBToken: string;
  let slotStartIso: string;

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

    const passwordHash = await bcrypt.hash(password, 12);

    const doctorUser = await prisma.user.create({
      data: {
        email: `doc-e2e-${stamp}@example.com`,
        passwordHash,
        role: Role.DOCTOR,
        doctorProfile: {
          create: {
            fullName: 'Dr Concurrent',
            pmdcNumber: `PMDC-E2E-${stamp}`,
            specialty: 'General',
            isVerified: true,
            verification: {
              create: {
                status: VerificationStatus.APPROVED,
                reviewedAt: new Date(),
              },
            },
            availabilities: {
              create: {
                // Monday
                dayOfWeek: 1,
                startMinutes: 9 * 60,
                endMinutes: 12 * 60,
                slotDurationMinutes: 30,
                isActive: true,
              },
            },
          },
        },
      },
      include: { doctorProfile: true },
    });
    doctorProfileId = doctorUser.doctorProfile!.id;

    // Next Monday 09:00 UTC
    const nextMonday = new Date();
    nextMonday.setUTCDate(
      nextMonday.getUTCDate() + ((1 + 7 - nextMonday.getUTCDay()) % 7 || 7),
    );
    nextMonday.setUTCHours(9, 0, 0, 0);
    slotStartIso = nextMonday.toISOString();

    const registerPatient = async (email: string) => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          role: Role.PATIENT,
          fullName: email,
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      return (loginRes.body as AuthResponse).accessToken;
    };

    patientAToken = await registerPatient(`patient-a-${stamp}@example.com`);
    patientBToken = await registerPatient(`patient-b-${stamp}@example.com`);
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
        await prisma.specialty.deleteMany({});
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

  it('allows only one of two concurrent bookings for the same slot', async () => {
    const payload = {
      doctorProfileId,
      slotStart: slotStartIso,
      consultationType: ConsultationType.VIDEO,
    };

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${patientBToken}`)
        .send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const success =
      resA.status === 201
        ? (resA.body as AppointmentResponse)
        : (resB.body as AppointmentResponse);
    expect(success.id).toBeDefined();
    expect(success.status).toBe('PENDING');

    const conflict: unknown = resA.status === 409 ? resA.body : resB.body;
    expect(JSON.stringify(conflict)).toContain('no longer available');

    const count = await prisma.appointment.count({
      where: {
        doctorProfileId,
        slotStart: new Date(slotStartIso),
      },
    });
    expect(count).toBe(1);
  });
});
