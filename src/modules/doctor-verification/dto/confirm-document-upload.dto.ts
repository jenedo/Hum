import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsString, MaxLength } from 'class-validator';

export class ConfirmDocumentUploadDto {
  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.PMDC_CERTIFICATE,
  })
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @ApiProperty({
    example: 'doctor-documents/doc_123/PMDC_CERTIFICATE/uuid-1234.pdf',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  storagePath!: string;
}
