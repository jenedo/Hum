import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, MinLength, ValidateIf } from 'class-validator';

export class VerifyDoctorDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ example: 'PMDC certificate expired' })
  @ValidateIf((dto: VerifyDoctorDto) => dto.approve === false)
  @IsString()
  @MinLength(3)
  rejectionReason?: string;
}
