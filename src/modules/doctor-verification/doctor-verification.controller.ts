import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { DoctorVerificationService } from './doctor-verification.service';
import { ConfirmDocumentUploadDto } from './dto/confirm-document-upload.dto';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';

@ApiTags('doctor-verification')
@ApiBearerAuth()
@Controller()
export class DoctorVerificationController {
  constructor(
    private readonly doctorVerificationService: DoctorVerificationService,
  ) {}

  @Roles(Role.DOCTOR)
  @Post('doctors/verification/documents/upload-url')
  @ApiOperation({
    summary: 'Request a signed upload URL for a doctor verification document',
  })
  requestUploadUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.doctorVerificationService.requestUploadUrl(user.userId, dto);
  }

  @Roles(Role.DOCTOR)
  @Post('doctors/verification/documents/confirm')
  @ApiOperation({
    summary: 'Confirm completed upload of a doctor verification document',
  })
  confirmDocumentUpload(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmDocumentUploadDto,
  ) {
    return this.doctorVerificationService.confirmDocumentUpload(
      user.userId,
      dto,
    );
  }

  @Roles(Role.DOCTOR)
  @Post('doctors/verification/documents')
  @ApiOperation({
    summary: 'Legacy direct upload endpoint (deprecated)',
  })
  uploadDocuments() {
    return this.doctorVerificationService.uploadDocuments();
  }

  @Roles(Role.ADMIN)
  @Post('admin/doctors/:id/verify')
  @ApiOperation({ summary: 'Approve or reject a doctor verification request' })
  verify(
    @CurrentUser() user: AuthUser,
    @Param('id') doctorProfileId: string,
    @Body() dto: VerifyDoctorDto,
  ) {
    return this.doctorVerificationService.verify(
      user.userId,
      doctorProfileId,
      dto,
    );
  }

  @Roles(Role.ADMIN)
  @Get('admin/doctors/pending')
  @ApiOperation({ summary: 'List pending doctor verification requests' })
  listPending() {
    return this.doctorVerificationService.listPending();
  }
}
