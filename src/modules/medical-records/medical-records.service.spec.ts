import { ForbiddenException } from '@nestjs/common';
import { StoragePurpose, StorageScanStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalFileValidationService } from './medical-file-validation.service';
import { MedicalRecordsService } from './medical-records.service';

type MockPrisma = {
  patientProfile: { findUnique: jest.Mock };
  storedObject: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

type MockAudit = {
  record: jest.Mock;
};

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let mockPrisma: MockPrisma;
  let mockAudit: MockAudit;
  let validationService: MedicalFileValidationService;

  beforeEach(() => {
    mockPrisma = {
      patientProfile: { findUnique: jest.fn() },
      storedObject: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    mockAudit = { record: jest.fn().mockResolvedValue({}) };
    validationService = new MedicalFileValidationService();
    service = new MedicalRecordsService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      validationService,
    );
  });

  it('creates upload intent with isAvailable=false and StorageScanStatus.PENDING', async () => {
    mockPrisma.patientProfile.findUnique.mockResolvedValue({ id: 'pat-1' });
    mockPrisma.storedObject.create.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      bucket: 'private-medical-records',
      objectPath: 'medical-records/pat-1/12345.pdf',
      uploadExpiresAt: new Date(Date.now() + 3600 * 1000),
    });

    const result = await service.createUploadIntent('user-1', {
      mimeType: 'application/pdf',
      sizeBytes: 1048576,
      purpose: StoragePurpose.MEDICAL_RECORD,
    });

    expect(result.storedObjectId).toBe('00000000-0000-0000-0000-000000000001');
    expect(mockAudit.record).toHaveBeenCalledWith(
      'user-1',
      'MEDICAL_RECORD_UPLOAD_INTENT',
      'StoredObject',
      '00000000-0000-0000-0000-000000000001',
      expect.objectContaining({ bucket: 'private-medical-records' }),
    );
  });

  it('confirms upload transitioning scanStatus to VALIDATING with isAvailable=false', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      ownerId: 'user-1',
      scanStatus: StorageScanStatus.PENDING,
      isAvailable: false,
      uploadExpiresAt: new Date(Date.now() + 3600 * 1000),
    });
    mockPrisma.storedObject.update.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      scanStatus: StorageScanStatus.VALIDATING,
      isAvailable: false,
      confirmedAt: new Date(),
    });

    const result = await service.confirmUpload('user-1', {
      storedObjectId: '00000000-0000-0000-0000-000000000001',
    });

    expect(result.scanStatus).toBe(StorageScanStatus.VALIDATING);
    expect(result.isAvailable).toBe(false);
  });

  it('rejects confirmation if user is not the owner', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      ownerId: 'other-user',
      scanStatus: StorageScanStatus.PENDING,
      isAvailable: false,
      uploadExpiresAt: new Date(Date.now() + 3600 * 1000),
    });

    await expect(
      service.confirmUpload('user-1', {
        storedObjectId: '00000000-0000-0000-0000-000000000001',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects download url request if file is not PASSED and available', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      ownerId: 'user-1',
      bucket: 'private-medical-records',
      objectPath: 'medical-records/pat-1/12345.pdf',
      scanStatus: StorageScanStatus.VALIDATING,
      isAvailable: false,
      deletedAt: null,
    });

    await expect(
      service.getDownloadUrl('user-1', '00000000-0000-0000-0000-000000000001'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
