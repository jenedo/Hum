import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StorageScanStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UploadIntentDto } from './dto/upload-intent.dto';
import { MedicalFileValidationService } from './medical-file-validation.service';

@Injectable()
export class MedicalRecordsService {
  private readonly BUCKET_NAME = 'private-medical-records';
  private readonly MAX_FILE_SIZE_BYTES = 5242880; // 5 MiB

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly fileValidationService: MedicalFileValidationService,
  ) {}

  async createUploadIntent(userId: string, dto: UploadIntentDto) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found for this account');
    }

    if (dto.sizeBytes > this.MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds maximum permitted limit of ${this.MAX_FILE_SIZE_BYTES} bytes (5 MiB)`,
      );
    }

    const extension = this.getExtensionForMime(dto.mimeType);
    const uniqueFileId = crypto.randomUUID();
    const objectPath = `medical-records/${patient.id}/${uniqueFileId}${extension}`;
    const uploadExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour expiry

    if (dto.idempotencyKey) {
      const existing = await this.prisma.storedObject.findFirst({
        where: {
          ownerId: userId,
          purpose: dto.purpose,
          scanStatus: StorageScanStatus.PENDING,
          uploadExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return {
          storedObjectId: existing.id,
          bucket: existing.bucket,
          objectPath: existing.objectPath,
          uploadUrl: `https://placeholder-storage.supabase.co/upload/${existing.objectPath}`,
          uploadExpiresAt: existing.uploadExpiresAt,
        };
      }
    }

    const storedObject = await this.prisma.storedObject.create({
      data: {
        ownerId: userId,
        patientId: patient.id,
        bucket: this.BUCKET_NAME,
        objectPath,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        purpose: dto.purpose,
        scanStatus: StorageScanStatus.PENDING,
        isAvailable: false,
        uploadExpiresAt,
      },
    });

    await this.auditService.record(
      userId,
      'MEDICAL_RECORD_UPLOAD_INTENT',
      'StoredObject',
      storedObject.id,
      { bucket: this.BUCKET_NAME, purpose: dto.purpose },
    );

    return {
      storedObjectId: storedObject.id,
      bucket: storedObject.bucket,
      objectPath: storedObject.objectPath,
      uploadUrl: `https://placeholder-storage.supabase.co/upload/${objectPath}`,
      uploadExpiresAt: storedObject.uploadExpiresAt,
    };
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    const record = await this.prisma.storedObject.findUnique({
      where: { id: dto.storedObjectId },
    });

    if (!record) {
      throw new NotFoundException('Medical record intent not found');
    }

    if (record.ownerId !== userId) {
      throw new ForbiddenException('You do not own this medical record');
    }

    if (record.scanStatus !== StorageScanStatus.PENDING) {
      throw new BadRequestException(
        `Upload confirmation rejected. Record is currently in ${record.scanStatus} state`,
      );
    }

    if (new Date() > record.uploadExpiresAt) {
      await this.prisma.storedObject.update({
        where: { id: record.id },
        data: {
          scanStatus: StorageScanStatus.ERROR,
          rejectionReason:
            'Upload confirmation expired past uploadExpiresAt timestamp',
        },
      });

      throw new BadRequestException(
        'Upload confirmation expired past uploadExpiresAt timestamp',
      );
    }

    // Fail-closed confirmation: transitions to VALIDATING with isAvailable=false.
    // DOES NOT mark PASSED or isAvailable=true until validation pipeline processes object.
    const updated = await this.prisma.storedObject.update({
      where: { id: record.id },
      data: {
        scanStatus: StorageScanStatus.VALIDATING,
        isAvailable: false,
        confirmedAt: new Date(),
      },
    });

    await this.auditService.record(
      userId,
      'MEDICAL_RECORD_UPLOAD_CONFIRMED',
      'StoredObject',
      record.id,
      { status: StorageScanStatus.VALIDATING },
    );

    return updated;
  }

  async getDownloadUrl(userId: string, recordId: string) {
    const record = await this.prisma.storedObject.findUnique({
      where: { id: recordId },
    });

    if (!record || record.deletedAt !== null) {
      throw new NotFoundException('Medical record not found');
    }

    if (record.ownerId !== userId) {
      throw new ForbiddenException('You do not own this medical record');
    }

    if (record.scanStatus !== StorageScanStatus.PASSED || !record.isAvailable) {
      throw new ForbiddenException(
        'Medical record is pending validation or has not passed security verification',
      );
    }

    const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds signed URL
    const signedUrl = `https://placeholder-storage.supabase.co/object/sign/${record.bucket}/${record.objectPath}?expires=${Math.floor(expiresAt.getTime() / 1000)}`;

    await this.auditService.record(
      userId,
      'MEDICAL_RECORD_DOWNLOAD_REQUESTED',
      'StoredObject',
      record.id,
      { expiresInSeconds: 60 },
    );

    return {
      downloadUrl: signedUrl,
      expiresAt,
    };
  }

  async listForPatient(userId: string) {
    const records = await this.prisma.storedObject.findMany({
      where: {
        ownerId: userId,
        isAvailable: true,
        scanStatus: StorageScanStatus.PASSED,
        deletedAt: null,
      },
      select: {
        id: true,
        bucket: true,
        purpose: true,
        mimeType: true,
        sizeBytes: true,
        scanStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.auditService.record(
      userId,
      'MEDICAL_RECORD_LIST_VIEWED',
      'StoredObject',
      'list',
      { count: records.length },
    );

    return records;
  }

  private getExtensionForMime(mimeType: string): string {
    switch (mimeType) {
      case 'application/pdf':
        return '.pdf';
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      default:
        throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }
  }
}
