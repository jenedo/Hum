import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RejectAppointmentDto {
  @ApiPropertyOptional({ example: 'Unavailable at this time' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
