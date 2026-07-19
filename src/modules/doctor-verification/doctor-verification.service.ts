import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocumentsDto } from './dto/upload-documents.dto';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';

@Injectable()
export class DoctorVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates DoctorDocument metadata only.
   * Real file upload to object storage is DEFERRED — storageKey is a placeholder.
   */
  async uploadDocuments(userId: string, dto: UploadDocumentsDto) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: { verification: true },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const verification =
      doctor.verification ??
      (await this.prisma.doctorVerification.create({
        data: {
          doctorProfileId: doctor.id,
          status: VerificationStatus.PENDING,
        },
      }));

    if (verification.status === VerificationStatus.APPROVED) {
      throw new BadRequestException(
        'Doctor is already verified; cannot upload new documents',
      );
    }

    if (verification.status === VerificationStatus.REJECTED) {
      await this.prisma.doctorVerification.update({
        where: { id: verification.id },
        data: {
          status: VerificationStatus.PENDING,
          rejectionReason: null,
          reviewedAt: null,
          reviewedById: null,
        },
      });
    }

    const documents = await this.prisma.$transaction(
      dto.types.map((type: DocumentType) =>
        this.prisma.doctorDocument.create({
          data: {
            doctorVerificationId: verification.id,
            type,
            // Placeholder — real object-storage upload is deferred
            storageKey: `placeholder/${doctor.id}/${type}/${Date.now()}`,
          },
        }),
      ),
    );

    return {
      verificationId: verification.id,
      documents,
      note: 'Real file upload is deferred; only document metadata with placeholder storageKey was stored.',
    };
  }

  async verify(adminUserId: string, doctorProfileId: string, dto: VerifyDoctorDto) {
    if (!dto.approve && !dto.rejectionReason) {
      throw new BadRequestException(
        'rejectionReason is required when rejecting a doctor',
      );
    }

    const verification = await this.prisma.doctorVerification.findUnique({
      where: { doctorProfileId },
    });

    if (!verification) {
      throw new NotFoundException(
        'No verification request found for this doctor',
      );
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `Verification is already ${verification.status}`,
      );
    }

    const status = dto.approve
      ? VerificationStatus.APPROVED
      : VerificationStatus.REJECTED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.doctorVerification.update({
        where: { id: verification.id },
        data: {
          status,
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          rejectionReason: dto.approve ? null : dto.rejectionReason,
        },
        include: { doctorProfile: true, documents: true },
      });

      if (dto.approve) {
        await tx.doctorProfile.update({
          where: { id: doctorProfileId },
          data: { isVerified: true },
        });
      }

      return result;
    });

    await this.auditService.record(
      adminUserId,
      dto.approve ? 'DOCTOR_VERIFICATION_APPROVED' : 'DOCTOR_VERIFICATION_REJECTED',
      'DoctorVerification',
      verification.id,
      {
        doctorProfileId,
        status,
        rejectionReason: dto.rejectionReason ?? null,
      },
    );

    return updated;
  }

  async listPending() {
    return this.prisma.doctorVerification.findMany({
      where: { status: VerificationStatus.PENDING },
      include: {
        doctorProfile: {
          select: {
            id: true,
            fullName: true,
            pmdcNumber: true,
            specialty: true,
            isVerified: true,
            userId: true,
          },
        },
        documents: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
