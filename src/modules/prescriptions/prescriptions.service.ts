import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxEventService } from '../notifications/outbox-event.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxEventService: OutboxEventService,
  ) {}

  async createForDoctor(userId: string, dto: CreatePrescriptionDto) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: {
        patientProfile: { select: { id: true, userId: true, fullName: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.doctorProfileId !== doctor.id) {
      throw new ForbiddenException('You do not own this appointment');
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Prescription can only be issued for completed appointments',
      );
    }

    if (appointment.patientProfile.userId === userId) {
      throw new ForbiddenException(
        'Doctor cannot issue a prescription for their own patient account',
      );
    }

    const payloadBytes = Buffer.byteLength(
      JSON.stringify(dto.medicines),
      'utf8',
    );
    if (payloadBytes > 16384) {
      throw new BadRequestException(
        'Medicines payload exceeds maximum size limit (16 KB)',
      );
    }

    try {
      const prescription = await this.prisma.$transaction(async (tx) => {
        const created = await tx.prescription.create({
          data: {
            appointmentId: appointment.id,
            doctorProfileId: doctor.id,
            patientProfileId: appointment.patientProfileId,
            medicines: dto.medicines as unknown as Prisma.InputJsonValue,
            instructions: dto.instructions ?? null,
            status: 'ISSUED',
            version: 1,
          },
          select: {
            id: true,
            appointmentId: true,
            doctorProfileId: true,
            patientProfileId: true,
            status: true,
            version: true,
            medicines: true,
            instructions: true,
            issuedAt: true,
            createdAt: true,
            updatedAt: true,
            doctorProfile: {
              select: { id: true, fullName: true, specialty: true },
            },
            patientProfile: { select: { id: true, fullName: true } },
          },
        });

        await this.outboxEventService.createEvent(tx, {
          eventType: NotificationType.PRESCRIPTION_ISSUED,
          aggregateType: 'Prescription',
          aggregateId: created.id,
          userId: appointment.patientProfile.userId,
          titleKey: 'notification.prescription.issued.title',
          bodyKey: 'notification.prescription.issued.body',
          entityType: 'Prescription',
          entityId: created.id,
          route: '/prescriptions/' + created.id,
        });

        return created;
      });

      await this.auditService.record(
        userId,
        'PRESCRIPTION_ISSUED',
        'Prescription',
        prescription.id,
        { appointmentId: appointment.id, version: prescription.version },
      );

      return prescription;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A prescription has already been issued for this appointment',
        );
      }
      throw error;
    }
  }

  async listForUser(userId: string, role: Role) {
    if (role === Role.DOCTOR) {
      const doctor = await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });
      if (!doctor) return [];

      const prescriptions = await this.prisma.prescription.findMany({
        where: { doctorProfileId: doctor.id },
        select: {
          id: true,
          appointmentId: true,
          status: true,
          version: true,
          medicines: true,
          instructions: true,
          issuedAt: true,
          createdAt: true,
          doctorProfile: {
            select: { id: true, fullName: true, specialty: true },
          },
          patientProfile: { select: { id: true, fullName: true } },
        },
        orderBy: { issuedAt: 'desc' },
      });

      await this.auditService.record(
        userId,
        'PRESCRIPTION_LIST_VIEWED',
        'Prescription',
        'list',
        { count: prescriptions.length },
      );

      return prescriptions;
    }

    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) return [];

    const prescriptions = await this.prisma.prescription.findMany({
      where: { patientProfileId: patient.id },
      select: {
        id: true,
        appointmentId: true,
        status: true,
        version: true,
        medicines: true,
        instructions: true,
        issuedAt: true,
        createdAt: true,
        doctorProfile: {
          select: { id: true, fullName: true, specialty: true },
        },
        patientProfile: { select: { id: true, fullName: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    await this.auditService.record(
      userId,
      'PRESCRIPTION_LIST_VIEWED',
      'Prescription',
      'list',
      { count: prescriptions.length },
    );

    return prescriptions;
  }

  async getById(userId: string, role: Role, prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: {
        id: true,
        appointmentId: true,
        status: true,
        version: true,
        medicines: true,
        instructions: true,
        issuedAt: true,
        createdAt: true,
        doctorProfile: {
          select: { id: true, userId: true, fullName: true, specialty: true },
        },
        patientProfile: { select: { id: true, userId: true, fullName: true } },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    const isPatientOwner =
      role === Role.PATIENT && prescription.patientProfile.userId === userId;
    const isDoctorOwner =
      role === Role.DOCTOR && prescription.doctorProfile.userId === userId;

    if (!isPatientOwner && !isDoctorOwner) {
      await this.auditService.record(
        userId,
        'PRESCRIPTION_ACCESS_DENIED',
        'Prescription',
        prescriptionId,
        { reason: 'unauthorized_ownership' },
      );

      throw new ForbiddenException(
        'You do not have access to this prescription',
      );
    }

    await this.auditService.record(
      userId,
      'PRESCRIPTION_VIEWED',
      'Prescription',
      prescription.id,
      { status: prescription.status },
    );

    return prescription;
  }
}
