import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UploadIntentDto } from './dto/upload-intent.dto';
import { MedicalRecordsService } from './medical-records.service';

@ApiTags('medical-records')
@ApiBearerAuth()
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @Roles(Role.PATIENT)
  @Get()
  @ApiOperation({
    summary:
      'List verified and available medical records for authenticated patient',
  })
  listForPatient(@CurrentUser() user: AuthUser) {
    return this.medicalRecordsService.listForPatient(user.userId);
  }

  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @Post('upload-intent')
  @ApiOperation({
    summary: 'Request upload intent and signed upload URL for medical document',
  })
  createUploadIntent(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadIntentDto,
  ) {
    return this.medicalRecordsService.createUploadIntent(user.userId, dto);
  }

  @Roles(Role.PATIENT)
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  @ApiOperation({ summary: 'Confirm upload complete for validation pipeline' })
  confirmUpload(@CurrentUser() user: AuthUser, @Body() dto: ConfirmUploadDto) {
    return this.medicalRecordsService.confirmUpload(user.userId, dto);
  }

  @Roles(Role.PATIENT)
  @Get(':id/download-url')
  @ApiOperation({
    summary: 'Generate a 60-second signed download URL for verified record',
  })
  getDownloadUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.medicalRecordsService.getDownloadUrl(user.userId, id);
  }
}
