import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  appointmentUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  reminders?: boolean;

  @IsOptional()
  @IsBoolean()
  prescriptionUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  pharmacyUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}
