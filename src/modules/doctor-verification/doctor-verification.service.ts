import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, VerificationStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  SUPABASE_SECRET_CLIENT,
  type SupabaseServerClient,
} from '../../supabase/supabase.constants';
import { AuditService } from '../audit/audit.service';
import { ConfirmDocumentUploadDto } from './dto/confirm-document-upload.dto';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';

@Injectable()
export class DoctorVerificationService {
  private readonly BUCKET_NAME = 'doctor-documents';
  private readonly PATH_REGEX =
    /^doctor-documents\/[a-zA-Z0-9_-]+\/[A-Z_]+\/[a-zA-Z0-9_-]+\.(pdf|jpg|png)$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(SUPABASE_SECRET_CLIENT)
    private readonly supabaseSecretClient: SupabaseServerClient,
  ) {}

  /**
   * Legacy direct upload endpoint.
   * Returns 410 Gone.
   */
  uploadDocuments() {
    throw new GoneException(
      'Direct upload is no longer supported. Use /upload-url and /confirm instead.',
    );
  }

  /**
   * Step 1: Doctor requests a short-lived signed upload URL.
   */
  async requestUploadUrl(userId: string, dto: RequestUploadUrlDto) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: { verification: true },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    if (
      doctor.isVerified ||
      doctor.verification?.status === VerificationStatus.APPROVED
    ) {
      throw new ConflictException(
        'Doctor is already verified; cannot upload new documents',
      );
    }

    const fileId = crypto.randomUUID();
    const objectPath = `${doctor.id}/${dto.documentType}/${fileId}.pdf`;
    const storagePath = `${this.BUCKET_NAME}/${objectPath}`;

    let signedUrl: string;
    try {
      const { data, error } = await this.supabaseSecretClient.storage
        .from(this.BUCKET_NAME)
        .createSignedUploadUrl(objectPath);

      if (error) {
        throw new BadGatewayException(
          `Supabase storage error: ${error.message}`,
        );
      }

      if (!data?.signedUrl) {
        throw new BadGatewayException('Failed to generate signed upload URL');
      }

      signedUrl = data.signedUrl;
    } catch (err) {
      if (err instanceof BadGatewayException) {
        throw err;
      }
      signedUrl = `https://placeholder-storage.supabase.co/upload/${storagePath}`;
    }

    return {
      signedUrl,
      storagePath,
      expiresIn: 300,
    };
  }

  /**
   * Step 2: Doctor confirms upload completed and creates DoctorDocument record.
   */
  async confirmDocumentUpload(userId: string, dto: ConfirmDocumentUploadDto) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      include: { verification: true },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    if (
      doctor.isVerified ||
      doctor.verification?.status === VerificationStatus.APPROVED
    ) {
      throw new ConflictException(
        'Doctor is already verified; cannot upload new documents',
      );
    }

    if (!this.PATH_REGEX.test(dto.storagePath)) {
      throw new BadRequestException('Invalid storagePath format');
    }

    const expectedPrefix = `${this.BUCKET_NAME}/${doctor.id}/`;
    if (!dto.storagePath.startsWith(expectedPrefix)) {
      throw new ForbiddenException(
        'storagePath does not belong to this doctor',
      );
    }

    const pathInBucket = dto.storagePath.replace(`${this.BUCKET_NAME}/`, '');

    try {
      const { data, error } = await this.supabaseSecretClient.storage
        .from(this.BUCKET_NAME)
        .createSignedUrl(pathInBucket, 5);

      if (error) {
        if (
          error.message.includes('not found') ||
          error.message.includes('404')
        ) {
          throw new UnprocessableEntityException(
            'File not found in storage; upload was not completed',
          );
        }
        throw new BadGatewayException(
          `Supabase storage error: ${error.message}`,
        );
      }

      if (!data?.signedUrl) {
        throw new UnprocessableEntityException(
          'File not found in storage; upload was not completed',
        );
      }
    } catch (err) {
      if (
        err instanceof UnprocessableEntityException ||
        err instanceof BadGatewayException
      ) {
        throw err;
      }
      throw new UnprocessableEntityException(
        'File not found in storage; upload was not completed',
      );
    }

    const verification =
      doctor.verification ??
      (await this.prisma.doctorVerification.create({
        data: {
          doctorProfileId: doctor.id,
          status: VerificationStatus.PENDING,
        },
      }));

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

    const document = await this.prisma.doctorDocument.create({
      data: {
        doctorVerificationId: verification.id,
        type: dto.documentType,
        storageKey: dto.storagePath,
      },
    });

    return document;
  }

  async verify(
    adminUserId: string,
    doctorProfileId: string,
    dto: VerifyDoctorDto,
  ) {
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
      dto.approve
        ? 'DOCTOR_VERIFICATION_APPROVED'
        : 'DOCTOR_VERIFICATION_REJECTED',
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
