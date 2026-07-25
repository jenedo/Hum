import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ConfirmUploadDto {
  @ApiProperty({
    description: 'StoredObject UUID created during upload-intent',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  storedObjectId: string;
}
