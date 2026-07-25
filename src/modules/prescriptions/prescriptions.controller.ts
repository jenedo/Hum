import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Roles(Role.DOCTOR)
  @Post()
  @ApiOperation({ summary: 'Issue a new prescription (doctor only)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.createForDoctor(user.userId, dto);
  }

  @Roles(Role.PATIENT, Role.DOCTOR)
  @Get()
  @ApiOperation({ summary: 'List prescriptions for the authenticated user' })
  listForUser(@CurrentUser() user: AuthUser) {
    return this.prescriptionsService.listForUser(user.userId, user.role);
  }

  @Roles(Role.PATIENT, Role.DOCTOR)
  @Get(':id')
  @ApiOperation({ summary: 'Get a single prescription by ID' })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prescriptionsService.getById(user.userId, user.role, id);
  }
}
