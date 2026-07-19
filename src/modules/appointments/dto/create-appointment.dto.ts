import { ApiProperty } from '@nestjs/swagger';
import { ConsultationType } from '@prisma/client';
import { IsDateString, IsEnum, IsUUID } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  doctorProfileId!: string;

  @ApiProperty({ example: '2026-07-20T09:00:00.000Z' })
  @IsDateString()
  slotStart!: string;

  @ApiProperty({ enum: ConsultationType })
  @IsEnum(ConsultationType)
  consultationType!: ConsultationType;
}
