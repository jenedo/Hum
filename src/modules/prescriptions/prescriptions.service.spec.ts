import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AppointmentStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrescriptionsService } from './prescriptions.service';

type MockPrisma = {
  doctorProfile: { findUnique: jest.Mock };
  patientProfile: { findUnique: jest.Mock };
  appointment: { findUnique: jest.Mock };
  prescription: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

type MockAudit = {
  record: jest.Mock;
};

type MockOutbox = {
  createEvent: jest.Mock;
};

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let mockPrisma: MockPrisma;
  let mockAudit: MockAudit;
  let mockOutbox: MockOutbox;

  beforeEach(() => {
    mockPrisma = {
      doctorProfile: { findUnique: jest.fn() },
      patientProfile: { findUnique: jest.fn() },
      appointment: { findUnique: jest.fn() },
      prescription: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: MockPrisma) => unknown) =>
          cb(mockPrisma),
        ),
    };
    mockAudit = { record: jest.fn().mockResolvedValue({}) };
    mockOutbox = { createEvent: jest.fn().mockResolvedValue(undefined) };

    service = new PrescriptionsService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      mockOutbox,
    );
  });

  it('creates prescription for doctor owning a completed appointment and emits outbox event', async () => {
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'user-doc',
    });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'doc-prof-1',
      patientProfileId: 'pat-prof-1',
      status: AppointmentStatus.COMPLETED,
      patientProfile: {
        id: 'pat-prof-1',
        userId: 'user-pat',
        fullName: 'John Patient',
      },
    });
    mockPrisma.prescription.create.mockResolvedValue({
      id: 'rx-1',
      appointmentId: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'doc-prof-1',
      patientProfileId: 'pat-prof-1',
      status: 'ISSUED',
      version: 1,
      medicines: [],
      instructions: null,
      issuedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      doctorProfile: {
        id: 'doc-prof-1',
        fullName: 'Dr. Ali',
        specialty: 'General',
      },
      patientProfile: { id: 'pat-prof-1', fullName: 'John Patient' },
    });

    const result = await service.createForDoctor('user-doc', {
      appointmentId: '00000000-0000-0000-0000-000000000001',
      medicines: [
        {
          name: 'Panadol',
          dosage: '500mg',
          frequency: '1-0-1',
          duration: '5 days',
        },
      ],
    });

    expect(result.id).toBe('rx-1');
    expect(mockPrisma.prescription.create).toHaveBeenCalled();
    expect(mockOutbox.createEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        eventType: NotificationType.PRESCRIPTION_ISSUED,
        aggregateType: 'Prescription',
        aggregateId: 'rx-1',
        userId: 'user-pat',
      }),
    );
    expect(mockAudit.record).toHaveBeenCalledWith(
      'user-doc',
      'PRESCRIPTION_ISSUED',
      'Prescription',
      'rx-1',
      expect.objectContaining({
        appointmentId: '00000000-0000-0000-0000-000000000001',
      }),
    );
  });

  it('rejects prescription if appointment status is not COMPLETED', async () => {
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'user-doc',
    });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'doc-prof-1',
      patientProfileId: 'pat-prof-1',
      status: AppointmentStatus.PENDING,
      patientProfile: { id: 'pat-prof-1', userId: 'user-pat' },
    });

    await expect(
      service.createForDoctor('user-doc', {
        appointmentId: '00000000-0000-0000-0000-000000000001',
        medicines: [
          {
            name: 'Panadol',
            dosage: '500mg',
            frequency: '1-0-1',
            duration: '5 days',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects prescription if doctor does not own appointment', async () => {
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'user-doc',
    });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'other-doc-prof',
      patientProfileId: 'pat-prof-1',
      status: AppointmentStatus.COMPLETED,
      patientProfile: { id: 'pat-prof-1', userId: 'user-pat' },
    });

    await expect(
      service.createForDoctor('user-doc', {
        appointmentId: '00000000-0000-0000-0000-000000000001',
        medicines: [
          {
            name: 'Panadol',
            dosage: '500mg',
            frequency: '1-0-1',
            duration: '5 days',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self-prescribing if doctor and patient are the same user', async () => {
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'user-same',
    });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'doc-prof-1',
      patientProfileId: 'pat-prof-1',
      status: AppointmentStatus.COMPLETED,
      patientProfile: { id: 'pat-prof-1', userId: 'user-same' },
    });

    await expect(
      service.createForDoctor('user-same', {
        appointmentId: '00000000-0000-0000-0000-000000000001',
        medicines: [
          {
            name: 'Panadol',
            dosage: '500mg',
            frequency: '1-0-1',
            duration: '5 days',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('handles database unique conflict and throws ConflictException', async () => {
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'user-doc',
    });
    mockPrisma.appointment.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000001',
      doctorProfileId: 'doc-prof-1',
      patientProfileId: 'pat-prof-1',
      status: AppointmentStatus.COMPLETED,
      patientProfile: { id: 'pat-prof-1', userId: 'user-pat' },
    });

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.0.0',
      },
    );
    mockPrisma.prescription.create.mockRejectedValue(p2002Error);

    await expect(
      service.createForDoctor('user-doc', {
        appointmentId: '00000000-0000-0000-0000-000000000001',
        medicines: [
          {
            name: 'Panadol',
            dosage: '500mg',
            frequency: '1-0-1',
            duration: '5 days',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
