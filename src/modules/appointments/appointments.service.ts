import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertTransition } from './appointment-state';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async book(userId: string, dto: CreateAppointmentDto) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    const slotStart = new Date(dto.slotStart);
    if (Number.isNaN(slotStart.getTime())) {
      throw new BadRequestException('Invalid slotStart');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const doctor = await tx.doctorProfile.findUnique({
          where: { id: dto.doctorProfileId },
        });

        if (!doctor || !doctor.isVerified) {
          throw new NotFoundException('Verified doctor not found');
        }

        const dayOfWeek = slotStart.getUTCDay();
        const minutesFromMidnight =
          slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();

        const windows = await tx.doctorAvailability.findMany({
          where: {
            doctorProfileId: doctor.id,
            dayOfWeek,
            isActive: true,
          },
        });

        const matchingWindow = windows.find((window) => {
          if (
            minutesFromMidnight < window.startMinutes ||
            minutesFromMidnight >= window.endMinutes
          ) {
            return false;
          }

          const offset = minutesFromMidnight - window.startMinutes;
          if (offset % window.slotDurationMinutes !== 0) {
            return false;
          }

          const slotEndMinutes =
            minutesFromMidnight + window.slotDurationMinutes;
          return slotEndMinutes <= window.endMinutes;
        });

        if (!matchingWindow) {
          throw new BadRequestException(
            'Requested slot does not fall within an active availability window',
          );
        }

        const slotEnd = new Date(
          slotStart.getTime() + matchingWindow.slotDurationMinutes * 60_000,
        );

        return tx.appointment.create({
          data: {
            patientProfileId: patient.id,
            doctorProfileId: doctor.id,
            slotStart,
            slotEnd,
            consultationType: dto.consultationType,
            status: AppointmentStatus.PENDING,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This slot is no longer available');
      }
      throw error;
    }
  }

  async accept(userId: string, appointmentId: string) {
    return this.transitionByDoctor(
      userId,
      appointmentId,
      AppointmentStatus.ACCEPTED,
    );
  }

  async reject(
    userId: string,
    appointmentId: string,
    dto: RejectAppointmentDto,
  ) {
    const appointment = await this.transitionByDoctor(
      userId,
      appointmentId,
      AppointmentStatus.REJECTED,
    );

    await this.auditService.record(
      userId,
      'APPOINTMENT_REJECTED',
      'Appointment',
      appointmentId,
      { reason: dto.reason ?? null },
    );

    return appointment;
  }

  async cancel(userId: string, role: Role, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patientProfile: { select: { userId: true } },
        doctorProfile: { select: { userId: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const isPatientOwner =
      role === Role.PATIENT && appointment.patientProfile.userId === userId;
    const isDoctorOwner =
      role === Role.DOCTOR && appointment.doctorProfile.userId === userId;

    if (!isPatientOwner && !isDoctorOwner) {
      throw new ForbiddenException('You do not own this appointment');
    }

    assertTransition(appointment.status, AppointmentStatus.CANCELLED, {
      slotStart: appointment.slotStart,
    });

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CANCELLED },
    });

    await this.auditService.record(
      userId,
      'APPOINTMENT_CANCELLED',
      'Appointment',
      appointmentId,
      { cancelledByRole: role },
    );

    return updated;
  }

  async getById(userId: string, role: Role, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patientProfile: { select: { id: true, userId: true, fullName: true } },
        doctorProfile: {
          select: { id: true, userId: true, fullName: true, specialty: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const isPatientOwner =
      role === Role.PATIENT && appointment.patientProfile.userId === userId;
    const isDoctorOwner =
      role === Role.DOCTOR && appointment.doctorProfile.userId === userId;

    if (!isPatientOwner && !isDoctorOwner) {
      throw new ForbiddenException(
        'You do not have access to this appointment',
      );
    }

    return appointment;
  }

  private async transitionByDoctor(
    userId: string,
    appointmentId: string,
    to: AppointmentStatus,
  ) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (appointment.doctorProfileId !== doctor.id) {
      throw new ForbiddenException('You do not own this appointment');
    }

    assertTransition(appointment.status, to, {
      slotStart: appointment.slotStart,
    });

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: to },
    });
  }
}
