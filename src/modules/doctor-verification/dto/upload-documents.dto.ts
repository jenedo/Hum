import { ApiProperty } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum } from 'class-validator';

export class UploadDocumentsDto {
  @ApiProperty({
    enum: DocumentType,
    isArray: true,
    example: [DocumentType.PMDC_CERTIFICATE, DocumentType.CNIC_FRONT],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(DocumentType, { each: true })
  types!: DocumentType[];
}
