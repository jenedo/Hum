import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RejectAppointmentDto } from './dto/reject-appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Roles(Role.PATIENT)
  @Post()
  @ApiOperation({ summary: 'Book an appointment slot (patient only)' })
  book(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.book(user.userId, dto);
  }

  @Roles(Role.DOCTOR)
  @Patch(':id/accept')
  @ApiOperation({ summary: 'Accept a pending appointment (owning doctor)' })
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.accept(user.userId, id);
  }

  @Roles(Role.DOCTOR)
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a pending appointment (owning doctor)' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectAppointmentDto,
  ) {
    return this.appointmentsService.reject(user.userId, id, dto);
  }

  @Roles(Role.PATIENT, Role.DOCTOR)
  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an appointment (owning patient or doctor)',
  })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.cancel(user.userId, user.role, id);
  }

  @Roles(Role.PATIENT, Role.DOCTOR)
  @Get(':id')
  @ApiOperation({
    summary: 'Get an appointment (owning patient or doctor only)',
  })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointmentsService.getById(user.userId, user.role, id);
  }
}
