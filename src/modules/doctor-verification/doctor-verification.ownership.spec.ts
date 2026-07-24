import { NotFoundException } from '@nestjs/common';
import { DocumentType, VerificationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AvailabilityService } from '../availability/availability.service';
import { DoctorVerificationService } from './doctor-verification.service';

describe('Doctor ownership boundaries (unit)', () => {
  const doctorAUserId = 'user-doctor-a';
  const doctorBUserId = 'user-doctor-b';
  const doctorAProfileId = 'profile-doctor-a';
  const doctorBProfileId = 'profile-doctor-b';

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

  describe('DoctorVerificationService.uploadDocuments', () => {
    it('attaches documents only to the caller verification profile resolved from userId', async () => {
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
        $transaction: jest
          .fn()
          .mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
      };

      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(prisma as never, audit);

      const result = await service.uploadDocuments(doctorAUserId, {
        types: [DocumentType.PMDC_CERT],
      });

      expect(prisma.doctorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: doctorAUserId },
        include: { verification: true },
      });
      expect(prisma.doctorProfile.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: doctorBUserId },
        }),
      );
      expect(prisma.doctorDocument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          doctorVerificationId: 'verif-a',
          type: DocumentType.PMDC_CERT,
        }) as {
          doctorVerificationId: string;
          type: DocumentType;
        },
      });
      expect(result.verificationId).toBe('verif-a');
      expect(prisma.doctorVerification.create).not.toHaveBeenCalled();
    });

    it('cannot upload documents when the caller has no doctor profile (e.g. wrong identity)', async () => {
      const prisma = {
        doctorProfile: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const audit = { record: jest.fn() } as unknown as AuditService;
      const service = new DoctorVerificationService(prisma as never, audit);

      await expect(
        service.uploadDocuments(doctorBUserId, {
          types: [DocumentType.CNIC],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.doctorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: doctorBUserId },
        include: { verification: true },
      });
    });
  });
});
