import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

type AuthResponse = {
  accessToken: string;
};

type MeResponse = {
  doctorProfile: { id: string };
};

type AvailabilityResponse = {
  id: string;
  doctorProfileId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

describe('Availability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'Password1!';
  const stamp = Date.now();

  let doctorAToken: string;
  let doctorBToken: string;
  let doctorAProfileId: string;
  let doctorBProfileId: string;

  const windowDto = {
    dayOfWeek: 4,
    startMinutes: 14 * 60,
    endMinutes: 16 * 60,
    slotDurationMinutes: 30,
  };

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

    const registerDoctor = async (email: string, pmdc: string) => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password,
          role: Role.DOCTOR,
          fullName: email,
          pmdcNumber: pmdc,
          specialty: 'General',
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      const token = (loginRes.body as AuthResponse).accessToken;

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return {
        token,
        profileId: (meRes.body as MeResponse).doctorProfile.id,
      };
    };

    const doctorA = await registerDoctor(
      `doc-avail-a-${stamp}@example.com`,
      `PMDC-AVAIL-A-${stamp}`,
    );
    const doctorB = await registerDoctor(
      `doc-avail-b-${stamp}@example.com`,
      `PMDC-AVAIL-B-${stamp}`,
    );

    doctorAToken = doctorA.token;
    doctorAProfileId = doctorA.profileId;
    doctorBToken = doctorB.token;
    doctorBProfileId = doctorB.profileId;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.appointment.deleteMany({});
      await prisma.doctorAvailability.deleteMany({});
      await prisma.doctorDocument.deleteMany({});
      await prisma.doctorVerification.deleteMany({});
      await prisma.auditLog.deleteMany({});
      await prisma.refreshToken.deleteMany({});
      await prisma.patientProfile.deleteMany({});
      await prisma.doctorProfile.deleteMany({});
      await prisma.user.deleteMany({
        where: { role: { in: [Role.PATIENT, Role.DOCTOR] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it('rejects overlapping windows for the same doctor but allows identical window for another doctor', async () => {
    const createA = await request(app.getHttpServer())
      .post('/api/v1/doctors/availability')
      .set('Authorization', `Bearer ${doctorAToken}`)
      .send(windowDto)
      .expect(201);

    const createdA = createA.body as AvailabilityResponse;
    expect(createdA.doctorProfileId).toBe(doctorAProfileId);
    expect(createdA.dayOfWeek).toBe(windowDto.dayOfWeek);

    // Overlapping window for the same doctor
    await request(app.getHttpServer())
      .post('/api/v1/doctors/availability')
      .set('Authorization', `Bearer ${doctorAToken}`)
      .send({
        dayOfWeek: windowDto.dayOfWeek,
        startMinutes: 15 * 60,
        endMinutes: 17 * 60,
        slotDurationMinutes: 30,
      })
      .expect(400);

    // Identical window for a different doctor must succeed (per-doctor scope)
    const createB = await request(app.getHttpServer())
      .post('/api/v1/doctors/availability')
      .set('Authorization', `Bearer ${doctorBToken}`)
      .send(windowDto)
      .expect(201);

    const createdB = createB.body as AvailabilityResponse;
    expect(createdB.doctorProfileId).toBe(doctorBProfileId);
    expect(createdB.doctorProfileId).not.toBe(doctorAProfileId);

    const countA = await prisma.doctorAvailability.count({
      where: { doctorProfileId: doctorAProfileId },
    });
    const countB = await prisma.doctorAvailability.count({
      where: { doctorProfileId: doctorBProfileId },
    });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});
