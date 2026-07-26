import { AppMode, DevicePlatform } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  installationId: string;

  @IsString()
  @IsNotEmpty()
  fcmToken: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsEnum(AppMode)
  appMode: AppMode;

  @IsString()
  @IsNotEmpty()
  appVersion: string;
}
