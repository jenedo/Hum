import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class BootstrapDto {
  @ApiProperty({ enum: [Role.PATIENT, Role.DOCTOR] })
  @IsEnum(Role, { message: 'Role must be PATIENT or DOCTOR' })
  role: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pmdcNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialty?: string;
}
