import {
  AppointmentStatus,
  ConsultationType,
  NotificationType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentsService } from './appointments.service';

type MockPrisma = {
  patientProfile: { findUnique: jest.Mock };
  doctorProfile: { findUnique: jest.Mock };
  doctorAvailability: { findMany: jest.Mock };
  appointment: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

type MockAudit = {
  record: jest.Mock;
};

type MockOutbox = {
  createEvent: jest.Mock;
};

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let mockPrisma: MockPrisma;
  let mockAudit: MockAudit;
  let mockOutbox: MockOutbox;

  beforeEach(() => {
    mockPrisma = {
      patientProfile: { findUnique: jest.fn() },
      doctorProfile: { findUnique: jest.fn() },
      doctorAvailability: { findMany: jest.fn() },
      appointment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: MockPrisma) => unknown) =>
          cb(mockPrisma),
        ),
    };
    mockAudit = { record: jest.fn().mockResolvedValue({}) };
    mockOutbox = { createEvent: jest.fn().mockResolvedValue(undefined) };

    service = new AppointmentsService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
      mockOutbox,
    );
  });

  describe('book', () => {
    it('creates appointment and emits outbox events for patient and doctor', async () => {
      mockPrisma.patientProfile.findUnique.mockResolvedValue({
        id: 'pat-1',
        userId: 'user-patient',
      });
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-doctor',
        isVerified: true,
      });
      mockPrisma.doctorAvailability.findMany.mockResolvedValue([
        {
          startMinutes: 0,
          endMinutes: 1440,
          slotDurationMinutes: 30,
          dayOfWeek: new Date('2026-08-03T10:00:00Z').getUTCDay(),
          isActive: true,
        },
      ]);
      mockPrisma.appointment.create.mockResolvedValue({
        id: 'app-1',
        patientProfileId: 'pat-1',
        doctorProfileId: 'doc-1',
        status: AppointmentStatus.PENDING,
      });

      const result = await service.book('user-patient', {
        doctorProfileId: 'doc-1',
        slotStart: '2026-08-03T10:00:00Z',
        consultationType: ConsultationType.VIDEO,
      });

      expect(result.id).toBe('app-1');
      expect(mockOutbox.createEvent).toHaveBeenCalledTimes(2);
      expect(mockOutbox.createEvent).toHaveBeenNthCalledWith(
        1,
        mockPrisma,
        expect.objectContaining({
          eventType: NotificationType.APPOINTMENT_BOOKED,
          userId: 'user-patient',
        }),
      );
      expect(mockOutbox.createEvent).toHaveBeenNthCalledWith(
        2,
        mockPrisma,
        expect.objectContaining({
          eventType: NotificationType.APPOINTMENT_BOOKED,
          userId: 'user-doctor',
        }),
      );
    });
  });

  describe('accept', () => {
    it('accepts appointment and emits outbox event for patient', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-doctor',
      });
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        doctorProfileId: 'doc-1',
        status: AppointmentStatus.PENDING,
        slotStart: new Date(Date.now() + 86400000),
        patientProfile: { userId: 'user-patient' },
      });
      mockPrisma.appointment.update.mockResolvedValue({
        id: 'app-1',
        status: AppointmentStatus.ACCEPTED,
      });

      const result = await service.accept('user-doctor', 'app-1');

      expect(result.status).toBe(AppointmentStatus.ACCEPTED);
      expect(mockOutbox.createEvent).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          eventType: NotificationType.APPOINTMENT_ACCEPTED,
          userId: 'user-patient',
        }),
      );
    });
  });

  describe('reject', () => {
    it('rejects appointment and emits outbox event for patient', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: 'doc-1',
        userId: 'user-doctor',
      });
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        doctorProfileId: 'doc-1',
        status: AppointmentStatus.PENDING,
        slotStart: new Date(Date.now() + 86400000),
        patientProfile: { userId: 'user-patient' },
      });
      mockPrisma.appointment.update.mockResolvedValue({
        id: 'app-1',
        status: AppointmentStatus.REJECTED,
      });

      const result = await service.reject('user-doctor', 'app-1', {
        reason: 'Not available',
      });

      expect(result.status).toBe(AppointmentStatus.REJECTED);
      expect(mockOutbox.createEvent).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          eventType: NotificationType.APPOINTMENT_REJECTED,
          userId: 'user-patient',
        }),
      );
    });
  });

  describe('cancel', () => {
    it('cancels appointment and emits outbox event for doctor when patient cancels', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        status: AppointmentStatus.PENDING,
        slotStart: new Date(Date.now() + 86400000),
        patientProfile: { userId: 'user-patient' },
        doctorProfile: { userId: 'user-doctor' },
      });
      mockPrisma.appointment.update.mockResolvedValue({
        id: 'app-1',
        status: AppointmentStatus.CANCELLED,
      });

      const result = await service.cancel(
        'user-patient',
        Role.PATIENT,
        'app-1',
      );

      expect(result.status).toBe(AppointmentStatus.CANCELLED);
      expect(mockOutbox.createEvent).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          eventType: NotificationType.APPOINTMENT_CANCELLED,
          userId: 'user-doctor',
          route: '/doctor/appointments/app-1',
        }),
      );
    });
  });
});
