import { GoneException, NotFoundException } from '@nestjs/common';
import { DocumentType, VerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AvailabilityService } from '../availability/availability.service';
import { DoctorVerificationService } from './doctor-verification.service';

describe('Doctor ownership boundaries (unit)', () => {
  const doctorAUserId = 'user-doctor-a';
  const doctorBUserId = 'user-doctor-b';
  const doctorAProfileId = 'profile-doctor-a';
  const doctorBProfileId = 'profile-doctor-b';

  const mockSupabaseSecretClient = {
    storage: {
      from: jest.fn().mockReturnValue({
        createSignedUploadUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://storage.example.com/upload' },
          error: null,
        }),
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://storage.example.com/signed' },
          error: null,
        }),
      }),
    },
  };

  describe('AvailabilityService.createForCurrentDoctor', () => {
    it('creates availability only for the caller profile resolved from userId, never another doctor', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: doctorAProfileId,
            userId: doctorAUserId,
          }),
        },
        doctorAvailability: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'avail-1', ...data }),
            ),
        },
      };

      const service = new AvailabilityService(prisma as never);

      const result = await service.createForCurrentDoctor(doctorAUserId, {
        dayOfWeek: 1,
        startMinutes: 540,
        endMinutes: 720,
        slotDurationMinutes: 30,
      });

      expect(prisma.doctorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: doctorAUserId },
      });
      expect(prisma.doctorProfile.findUnique).not.toHaveBeenCalledWith({
        where: { userId: doctorBUserId },
      });
      expect(prisma.doctorAvailability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          doctorProfileId: doctorAProfileId,
        }) as { doctorProfileId: string },
      });
      expect(result.doctorProfileId).toBe(doctorAProfileId);
      expect(result.doctorProfileId).not.toBe(doctorBProfileId);
    });

    it('does not look up availability windows belonging to another doctor when checking overlap', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: doctorAProfileId,
            userId: doctorAUserId,
          }),
        },
        doctorAvailability: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'avail-1' }),
        },
      };

      const service = new AvailabilityService(prisma as never);

      await service.createForCurrentDoctor(doctorAUserId, {
        dayOfWeek: 1,
        startMinutes: 540,
        endMinutes: 720,
        slotDurationMinutes: 30,
      });

      expect(prisma.doctorAvailability.findMany).toHaveBeenCalledWith({
        where: {
          doctorProfileId: doctorAProfileId,
          dayOfWeek: 1,
          isActive: true,
        },
      });
    });
  });

  describe('DoctorVerificationService upload endpoints', () => {
    it('throws GoneException when legacy uploadDocuments is called', () => {
      const prisma = {};
      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(
        prisma as never,
        audit,
        mockSupabaseSecretClient as never,
      );

      expect(() => service.uploadDocuments()).toThrow(GoneException);
    });

    it('requestUploadUrl returns signed upload URL for caller profile resolved from userId', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: doctorAProfileId,
            userId: doctorAUserId,
            verification: null,
          }),
        },
      };
      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(
        prisma as never,
        audit,
        mockSupabaseSecretClient as never,
      );

      const result = await service.requestUploadUrl(doctorAUserId, {
        documentType: DocumentType.PMDC_CERTIFICATE,
      });

      expect(prisma.doctorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: doctorAUserId },
        include: { verification: true },
      });
      expect(result.storagePath).toContain(
        `doctor-documents/${doctorAProfileId}/PMDC_CERTIFICATE/`,
      );
      expect(result.expiresIn).toBe(300);
    });

    it('confirmDocumentUpload creates document for verified storage path belonging to caller', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: doctorAProfileId,
            userId: doctorAUserId,
            verification: {
              id: 'verif-a',
              status: VerificationStatus.PENDING,
            },
          }),
        },
        doctorVerification: {
          create: jest.fn(),
        },
        doctorDocument: {
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'doc-1', ...data }),
            ),
        },
      };
      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(
        prisma as never,
        audit,
        mockSupabaseSecretClient as never,
      );

      const storagePath = `doctor-documents/${doctorAProfileId}/PMDC_CERTIFICATE/file-1234.pdf`;
      const result = await service.confirmDocumentUpload(doctorAUserId, {
        documentType: DocumentType.PMDC_CERTIFICATE,
        storagePath,
      });

      expect(prisma.doctorDocument.create).toHaveBeenCalledWith({
        data: {
          doctorVerificationId: 'verif-a',
          type: DocumentType.PMDC_CERTIFICATE,
          storageKey: storagePath,
        },
      });
      expect(result.storageKey).toBe(storagePath);
    });

    it('cannot request upload url when doctor profile does not exist', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(
        prisma as never,
        audit,
        mockSupabaseSecretClient as never,
      );

      await expect(
        service.requestUploadUrl(doctorBUserId, {
          documentType: DocumentType.CNIC_FRONT,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
