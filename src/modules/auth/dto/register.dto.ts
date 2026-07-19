import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+923001234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'mobile must be a valid phone number',
  })
  mobile?: string;

  @ApiProperty({ minLength: 8, example: 'Password1!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: [Role.PATIENT, Role.DOCTOR] })
  @IsIn([Role.PATIENT, Role.DOCTOR], {
    message: 'role must be PATIENT or DOCTOR',
  })
  role!: typeof Role.PATIENT | typeof Role.DOCTOR;

  @ApiProperty({ example: 'Ali Khan' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.PATIENT)
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.PATIENT)
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'PMDC-12345' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.DOCTOR)
  @IsString()
  @MinLength(3)
  pmdcNumber?: string;

  @ApiPropertyOptional({ example: 'Cardiology' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.DOCTOR)
  @IsString()
  @MinLength(2)
  specialty?: string;
}
