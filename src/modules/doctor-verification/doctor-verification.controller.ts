import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { DoctorVerificationService } from './doctor-verification.service';
import { UploadDocumentsDto } from './dto/upload-documents.dto';
import { VerifyDoctorDto } from './dto/verify-doctor.dto';

@ApiTags('doctor-verification')
@ApiBearerAuth()
@Controller()
export class DoctorVerificationController {
  constructor(
    private readonly doctorVerificationService: DoctorVerificationService,
  ) {}

  @Roles(Role.DOCTOR)
  @Post('doctors/verification/documents')
  @ApiOperation({
    summary:
      'Upload doctor verification document metadata (real file upload deferred)',
  })
  uploadDocuments(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDocumentsDto,
  ) {
    return this.doctorVerificationService.uploadDocuments(user.userId, dto);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
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

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('admin/doctors/pending')
  @ApiOperation({ summary: 'List pending doctor verification requests' })
  listPending() {
    return this.doctorVerificationService.listPending();
  }
}
