import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateAvailabilityDto {
  @ApiProperty({ example: 1, description: '0=Sunday … 6=Saturday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: 540, description: 'Minutes from midnight (e.g. 9:00 = 540)' })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinutes!: number;

  @ApiProperty({ example: 1020, description: 'Minutes from midnight (e.g. 17:00 = 1020)' })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinutes!: number;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes!: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
