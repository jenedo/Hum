import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { DeviceRegistrationsService } from './device-registrations.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly deviceRegistrationsService: DeviceRegistrationsService,
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Post('devices')
  @ApiOperation({ summary: 'Register or update device FCM token' })
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.deviceRegistrationsService.upsertDevice(user.userId, dto);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke device registration' })
  revokeDevice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceRegistrationsService.revokeDevice(user.userId, id);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Get paginated notifications inbox' })
  getInbox(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.getInbox(user.userId, query);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of unread notifications' })
  getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark single notification as read' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notificationPreferencesService.getPreferences(user.userId);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationPreferencesService.updatePreferences(
      user.userId,
      dto,
    );
  }
}
