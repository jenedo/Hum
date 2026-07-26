import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DeviceRegistrationsService } from './device-registrations.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    DeviceRegistrationsService,
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    DeviceRegistrationsService,
  ],
})
export class NotificationsModule {}
