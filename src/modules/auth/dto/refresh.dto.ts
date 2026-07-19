import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: 'Opaque refresh token in the form <tokenId>.<secret>',
  })
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
