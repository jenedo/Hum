import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConsultationType,
  DocumentType,
  Role,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

type AuthResponse = {
  accessToken: string;
};

type MeResponse = {
  doctorProfile: { id: string; isVerified: boolean };
};

type UploadResponse = {
  verificationId: string;
  documents: Array<{ type: string; storageKey: string }>;
};

describe('Doctor Verification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const password = 'Password1!';
  const stamp = Date.now();
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? `admin-e2e-${stamp}@example.com`;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeAdmin1!';

  let adminToken: string;
  let patientToken: string;

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

    const existingAdmin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });

    if (!existingAdmin) {
      await prisma.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          passwordHash: await bcrypt.hash(adminPassword, 12),
          role: Role.ADMIN,
        },
      });
    }

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: existingAdmin?.email ?? adminEmail.toLowerCase(),
        password: existingAdmin ? adminPassword : adminPassword,
      });

    // If a pre-seeded admin exists with a different password, recreate a suite-local admin
    if (adminLogin.status !== 200) {
      const localEmail = `admin-suite-${stamp}@example.com`;
      await prisma.user.create({
        data: {
          email: localEmail,
          passwordHash: await bcrypt.hash(adminPassword, 12),
          role: Role.ADMIN,
        },
      });
      const retry = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: localEmail, password: adminPassword })
        .expect(200);
      adminToken = (retry.body as AuthResponse).accessToken;
    } else {
      adminToken = (adminLogin.body as AuthResponse).accessToken;
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `patient-verify-${stamp}@example.com`,
        password,
        role: Role.PATIENT,
        fullName: 'Verify Patient',
      })
      .expect(201);

    const patientLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `patient-verify-${stamp}@example.com`,
        password,
      })
      .expect(200);
    patientToken = (patientLogin.body as AuthResponse).accessToken;
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
        // Keep ADMIN users so the seed remains usable across suites
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

  it('approve path: unverified doctor is excluded until admin approves, then bookable', async () => {
    const doctorEmail = `doc-approve-${stamp}@example.com`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: doctorEmail,
        password,
        role: Role.DOCTOR,
        fullName: 'Dr Approve',
        pmdcNumber: `PMDC-APPROVE-${stamp}`,
        specialty: 'Cardiology',
      })
      .expect(201);

    const doctorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: doctorEmail, password })
      .expect(200);
    const doctorToken = (doctorLogin.body as AuthResponse).accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    const me = meRes.body as MeResponse;
    const doctorProfileId = me.doctorProfile.id;
    expect(me.doctorProfile.isVerified).toBe(false);

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/doctors/verification/documents')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ types: [DocumentType.PMDC_CERT, DocumentType.CNIC] })
      .expect(201);

    const uploadBody = uploadRes.body as UploadResponse;
    expect(uploadBody.verificationId).toBeDefined();
    expect(uploadBody.documents).toHaveLength(2);
    expect(uploadBody.documents[0].storageKey).toContain('placeholder/');

    await request(app.getHttpServer())
      .post('/api/v1/doctors/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        dayOfWeek: 2,
        startMinutes: 10 * 60,
        endMinutes: 12 * 60,
        slotDurationMinutes: 30,
      })
      .expect(201);

    // Not verified yet — public availability must exclude them
    await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorProfileId}/availability`)
      .expect(404);

    const pendingRes = await request(app.getHttpServer())
      .get('/api/v1/admin/doctors/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const pending = pendingRes.body as Array<{
      doctorProfileId: string;
      status: string;
    }>;
    expect(
      pending.some((row) => row.doctorProfileId === doctorProfileId),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/doctors/${doctorProfileId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: true })
      .expect(201);

    const availabilityRes = await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorProfileId}/availability`)
      .expect(200);

    expect(availabilityRes.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dayOfWeek: 2,
          startMinutes: 600,
          endMinutes: 720,
        }),
      ]),
    );

    const profile = await prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
    });
    expect(profile?.isVerified).toBe(true);

    // Next Tuesday 10:00 UTC — aligned to the window above
    const nextTuesday = new Date();
    nextTuesday.setUTCDate(
      nextTuesday.getUTCDate() + ((2 + 7 - nextTuesday.getUTCDay()) % 7 || 7),
    );
    nextTuesday.setUTCHours(10, 0, 0, 0);

    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorProfileId,
        slotStart: nextTuesday.toISOString(),
        consultationType: ConsultationType.VIDEO,
      })
      .expect(201);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'DOCTOR_VERIFICATION_APPROVED',
        targetType: 'DoctorVerification',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('reject path: admin rejection keeps doctor unverified and unbookable', async () => {
    const doctorEmail = `doc-reject-${stamp}@example.com`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: doctorEmail,
        password,
        role: Role.DOCTOR,
        fullName: 'Dr Reject',
        pmdcNumber: `PMDC-REJECT-${stamp}`,
        specialty: 'Dermatology',
      })
      .expect(201);

    const doctorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: doctorEmail, password })
      .expect(200);
    const doctorToken = (doctorLogin.body as AuthResponse).accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    const doctorProfileId = (meRes.body as MeResponse).doctorProfile.id;

    await request(app.getHttpServer())
      .post('/api/v1/doctors/verification/documents')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ types: [DocumentType.DEGREE] })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/doctors/availability')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        dayOfWeek: 3,
        startMinutes: 9 * 60,
        endMinutes: 11 * 60,
        slotDurationMinutes: 30,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/doctors/${doctorProfileId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        approve: false,
        rejectionReason: 'PMDC certificate expired',
      })
      .expect(201);

    const verification = await prisma.doctorVerification.findUnique({
      where: { doctorProfileId },
    });
    expect(verification?.status).toBe(VerificationStatus.REJECTED);
    expect(verification?.rejectionReason).toBe('PMDC certificate expired');

    const profile = await prisma.doctorProfile.findUnique({
      where: { id: doctorProfileId },
    });
    expect(profile?.isVerified).toBe(false);

    await request(app.getHttpServer())
      .get(`/api/v1/doctors/${doctorProfileId}/availability`)
      .expect(404);

    const nextWednesday = new Date();
    nextWednesday.setUTCDate(
      nextWednesday.getUTCDate() +
        ((3 + 7 - nextWednesday.getUTCDay()) % 7 || 7),
    );
    nextWednesday.setUTCHours(9, 0, 0, 0);

    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorProfileId,
        slotStart: nextWednesday.toISOString(),
        consultationType: ConsultationType.AUDIO,
      })
      .expect(404);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'DOCTOR_VERIFICATION_REJECTED',
        targetType: 'DoctorVerification',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});
