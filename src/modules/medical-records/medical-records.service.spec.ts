import { ForbiddenException } from '@nestjs/common';
import { StoragePurpose, StorageScanStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalFileValidationService } from './medical-file-validation.service';
import { MedicalRecordsService } from './medical-records.service';

import { type SupabaseServerClient } from '../../supabase/supabase.constants';

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

type MockSupabaseClient = {
  storage: {
    from: (_bucket: string) => {
      createSignedUploadUrl: (
        _path: string,
      ) => Promise<{ data: { signedUrl: string } | null; error: null }>;
      createSignedUrl: (
        _path: string,
        _expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: null }>;
    };
  };
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
    const mockSupabaseClient: MockSupabaseClient = {
      storage: {
        from: jest.fn().mockReturnValue({
          createSignedUploadUrl: jest.fn().mockResolvedValue({
            data: { signedUrl: 'https://supabase.local/upload' },
            error: null,
          }),
          createSignedUrl: jest.fn().mockResolvedValue({
            data: { signedUrl: 'https://supabase.local/download' },
            error: null,
          }),
        }),
      },
    };
    service = new MedicalRecordsService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      validationService,
      mockSupabaseClient as unknown as SupabaseServerClient,
    );
  });

  it('creates upload intent with StorageScanStatus.PENDING', async () => {
    mockPrisma.patientProfile.findUnique.mockResolvedValue({ id: 'pat-1' });
    mockPrisma.storedObject.create.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      bucketName: 'private-medical-records',
      objectKey: 'medical-records/pat-1/12345.pdf',
      createdAt: new Date(),
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
      expect.objectContaining({
        bucket: 'private-medical-records',
      }),
    );
  });

  it('confirms upload keeping scanStatus PENDING until validation pipeline processes object', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      patientProfile: { userId: 'user-1' },
      scanStatus: StorageScanStatus.PENDING,
      createdAt: new Date(),
    });
    mockPrisma.storedObject.update.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      scanStatus: StorageScanStatus.PENDING,
    });

    const result = await service.confirmUpload('user-1', {
      storedObjectId: '00000000-0000-0000-0000-000000000001',
    });

    expect(result.scanStatus).toBe(StorageScanStatus.PENDING);
  });

  it('rejects confirmation if user is not the owner', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      patientProfile: { userId: 'other-user' },
      scanStatus: StorageScanStatus.PENDING,
      createdAt: new Date(),
    });

    await expect(
      service.confirmUpload('user-1', {
        storedObjectId: '00000000-0000-0000-0000-000000000001',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects download url request if file is not CLEAN', async () => {
    mockPrisma.storedObject.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      patientProfile: { userId: 'user-1' },
      bucketName: 'private-medical-records',
      objectKey: 'medical-records/pat-1/12345.pdf',
      scanStatus: StorageScanStatus.PENDING,
    });

    await expect(
      service.getDownloadUrl('user-1', '00000000-0000-0000-0000-000000000001'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
