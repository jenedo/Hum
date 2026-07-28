import { Injectable } from '@nestjs/common';
import { StorageScanStatus } from '@prisma/client';
import * as crypto from 'crypto';

export interface FileValidationResult {
  scanStatus: StorageScanStatus;
  sha256?: string;
  rejectionReason?: string;
}

@Injectable()
export class MedicalFileValidationService {
  /**
   * Validates magic bytes against claimed MIME type.
   */
  validateMagicBytes(buffer: Buffer, claimedMime: string): boolean {
    if (buffer.length < 4) return false;

    if (claimedMime === 'application/pdf') {
      // %PDF-
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    }

    if (claimedMime === 'image/jpeg') {
      // 0xFF 0xD8 0xFF
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    if (claimedMime === 'image/png') {
      // 0x89 PNG
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }

    return false;
  }

  /**
   * Calculates SHA-256 hash of object content buffer.
   */
  calculateSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Fail-closed validation boundary.
   */
  processValidation(buffer: Buffer, claimedMime: string): FileValidationResult {
    const isValidMagic = this.validateMagicBytes(buffer, claimedMime);
    if (!isValidMagic) {
      return {
        scanStatus: StorageScanStatus.INFECTED,
        rejectionReason:
          'File signature magic bytes do not match declared MIME type',
      };
    }

    const sha256 = this.calculateSha256(buffer);

    return {
      scanStatus: StorageScanStatus.PENDING,
      sha256,
      rejectionReason: undefined,
    };
  }
}
