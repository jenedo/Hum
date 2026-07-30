import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class RequestUploadUrlDto {
  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.PMDC_CERTIFICATE,
  })
  @IsEnum(DocumentType)
  documentType!: DocumentType;
}
