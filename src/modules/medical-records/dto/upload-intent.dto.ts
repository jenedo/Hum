import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StoragePurpose } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UploadIntentDto {
  @ApiProperty({
    enum: ['application/pdf', 'image/jpeg', 'image/png'],
    example: 'application/pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['application/pdf', 'image/jpeg', 'image/png'])
  mimeType: string;

  @ApiProperty({
    example: 1048576,
    description: 'File size in bytes (max 5 MiB)',
  })
  @IsInt()
  @Min(1024)
  @Max(5242880)
  sizeBytes: number;

  @ApiProperty({ enum: StoragePurpose, example: StoragePurpose.MEDICAL_RECORD })
  @IsEnum(StoragePurpose)
  purpose: StoragePurpose;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
