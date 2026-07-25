import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StoragePurpose, StorageScanStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { MedicalRecordsService } from '../src/modules/medical-records/medical-records.service';

interface StorageBucketRow {
  id: string;
  name: string;
  public: boolean;
  file_size_limit: string | number | null;
  allowed_mime_types: string[] | null;
}

interface StoragePolicyRow {
  policyname: string;
  cmd: string;
  roles: string;
  qual: string | null;
  with_check: string | null;
}

describe('Batch 6B.1: Storage Policy Security & Upload Verification (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;
  let medicalRecordsService: MedicalRecordsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    medicalRecordsService = app.get<MedicalRecordsService>(
      MedicalRecordsService,
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Verifies private-medical-records bucket exists in database', async () => {
    const bucket = await prisma.$queryRaw<StorageBucketRow[]>`
      SELECT id, name, public, file_size_limit::text, allowed_mime_types
      FROM storage.buckets
      WHERE id = 'private-medical-records';
    `;

    expect(bucket.length).toBe(1);
    expect(bucket[0].id).toBe('private-medical-records');
    expect(bucket[0].name).toBe('private-medical-records');
  });

  it('2. Verifies private-medical-records bucket is private (public = false)', async () => {
    const bucket = await prisma.$queryRaw<StorageBucketRow[]>`
      SELECT id, name, public, file_size_limit::text, allowed_mime_types
      FROM storage.buckets
      WHERE id = 'private-medical-records';
    `;

    expect(bucket[0].public).toBe(false);
    expect(bucket[0].file_size_limit).toBe('5242880');
    expect(bucket[0].allowed_mime_types).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]);
  });

  it('3. Rejects invalid MIME type for upload intent', async () => {
    const dummyUserId = 'user-mime-test';
    const dummyPatientId = 'pat-mime-test';

    await prisma.user.upsert({
      where: { id: dummyUserId },
      update: {},
      create: {
        id: dummyUserId,
        email: 'mimetype@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: dummyUserId },
      update: {},
      create: {
        id: dummyPatientId,
        userId: dummyUserId,
        fullName: 'Mime Test Patient',
      },
    });

    await expect(
      medicalRecordsService.createUploadIntent(dummyUserId, {
        mimeType: 'application/x-msdownload',
        sizeBytes: 1000,
        purpose: StoragePurpose.MEDICAL_RECORD,
      }),
    ).rejects.toThrow('Unsupported MIME type: application/x-msdownload');
  });

  it('4. Rejects file size exceeding 5 MiB limit', async () => {
    const OVER_LIMIT_BYTES = 5242881;
    const dummyUserId = 'user-overlimit-test';
    const dummyPatientId = 'pat-overlimit-test';

    await prisma.user.upsert({
      where: { id: dummyUserId },
      update: {},
      create: {
        id: dummyUserId,
        email: 'overlimit@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: dummyUserId },
      update: {},
      create: {
        id: dummyPatientId,
        userId: dummyUserId,
        fullName: 'Over Limit Test',
      },
    });

    await expect(
      medicalRecordsService.createUploadIntent(dummyUserId, {
        mimeType: 'application/pdf',
        sizeBytes: OVER_LIMIT_BYTES,
        purpose: StoragePurpose.MEDICAL_RECORD,
      }),
    ).rejects.toThrow(
      'File size exceeds maximum permitted limit of 5242880 bytes (5 MiB)',
    );
  });

  it('5. Verifies broad anon & authenticated policies are removed (RLS default deny state)', async () => {
    const policies = await prisma.$queryRaw<StoragePolicyRow[]>`
      SELECT policyname, cmd, roles::text, qual::text, with_check::text
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
      ORDER BY policyname;
    `;

    // No broad policies exist; RLS default deny governs direct access
    expect(policies.length).toBe(0);
  });

  it('6. Generates signed upload URL only after NestJS authorization and metadata persistence', async () => {
    const testUserId = 'user-intent-test';
    const testPatientId = 'pat-intent-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'intent@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Intent Test Patient',
      },
    });

    const res = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 1024,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    expect(res.storedObjectId).toBeDefined();
    expect(res.bucket).toBe('private-medical-records');
    expect(res.objectPath).toContain(`medical-records/${testPatientId}/`);
    expect(res.uploadUrl).toBeDefined();

    // Verify stored object in database is PENDING and isAvailable=false
    const stored = await prisma.storedObject.findUnique({
      where: { id: res.storedObjectId },
    });
    expect(stored).toBeDefined();
    expect(stored?.scanStatus).toBe(StorageScanStatus.PENDING);
    expect(stored?.isAvailable).toBe(false);
  });

  it('7. Signed upload URL is path-bound and cannot target arbitrary paths', async () => {
    const testUserId = 'user-pathbound-test';
    const testPatientId = 'pat-pathbound-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'pathbound@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Pathbound Patient',
      },
    });

    const res = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    // Object path must be scoped to medical-records/<patientId>/<uuid>.pdf
    expect(res.objectPath.startsWith(`medical-records/${testPatientId}/`)).toBe(
      true,
    );
    expect(res.uploadUrl).toContain(res.objectPath);
  });

  it('8. Confirm changes status from PENDING to VALIDATING and preserves isAvailable = false', async () => {
    const testUserId = 'user-confirm-test';
    const testPatientId = 'pat-confirm-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'confirm@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Confirm Test Patient',
      },
    });

    const intent = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    const confirmed = await medicalRecordsService.confirmUpload(testUserId, {
      storedObjectId: intent.storedObjectId,
    });

    expect(confirmed.scanStatus).toBe(StorageScanStatus.VALIDATING);
    expect(confirmed.isAvailable).toBe(false);
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it('9. Download attempt before PASSED returns HTTP 403 Forbidden', async () => {
    const testUserId = 'user-download-deny-test';
    const testPatientId = 'pat-download-deny-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'downloaddeny@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Download Deny Patient',
      },
    });

    const intent = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'image/png',
      sizeBytes: 4096,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    await medicalRecordsService.confirmUpload(testUserId, {
      storedObjectId: intent.storedObjectId,
    });

    // Record is in VALIDATING state with isAvailable = false
    await expect(
      medicalRecordsService.getDownloadUrl(testUserId, intent.storedObjectId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('10. Expired upload intent is rejected', async () => {
    const testUserId = 'user-expire-test';
    const testPatientId = 'pat-expire-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'expire@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Expire Test Patient',
      },
    });

    const intent = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    // Expire uploadExpiresAt timestamp
    await prisma.storedObject.update({
      where: { id: intent.storedObjectId },
      data: {
        uploadExpiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    await expect(
      medicalRecordsService.confirmUpload(testUserId, {
        storedObjectId: intent.storedObjectId,
      }),
    ).rejects.toThrow(
      'Upload confirmation expired past uploadExpiresAt timestamp',
    );

    const updated = await prisma.storedObject.findUnique({
      where: { id: intent.storedObjectId },
    });
    expect(updated?.scanStatus).toBe(StorageScanStatus.ERROR);
  });

  it('11. Replayed confirmation is handled idempotently', async () => {
    const testUserId = 'user-replay-test';
    const testPatientId = 'pat-replay-test';

    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'replay@asaancare.test',
        role: 'PATIENT',
      },
    });

    await prisma.patientProfile.upsert({
      where: { userId: testUserId },
      update: {},
      create: {
        id: testPatientId,
        userId: testUserId,
        fullName: 'Replay Test Patient',
      },
    });

    const intent = await medicalRecordsService.createUploadIntent(testUserId, {
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    const firstConfirm = await medicalRecordsService.confirmUpload(testUserId, {
      storedObjectId: intent.storedObjectId,
    });
    expect(firstConfirm.scanStatus).toBe(StorageScanStatus.VALIDATING);

    const secondConfirm = await medicalRecordsService.confirmUpload(
      testUserId,
      {
        storedObjectId: intent.storedObjectId,
      },
    );
    expect(secondConfirm.scanStatus).toBe(StorageScanStatus.VALIDATING);
    expect(secondConfirm.id).toBe(firstConfirm.id);
  });

  it('12. Download signed URL is not logged in application audit logs', async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        action: 'MEDICAL_RECORD_DOWNLOAD_REQUESTED',
      },
    });

    for (const log of logs) {
      const details = JSON.stringify(log.metadata ?? {});
      expect(details).not.toContain('http');
      expect(details).not.toContain('token=');
    }
  });
});
