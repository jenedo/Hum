import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DeviceRegistrationsService } from './device-registrations.service';
import { FirebaseAdminModule } from './firebase/firebase-admin.module';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { OutboxEventService } from './outbox-event.service';
import { OutboxWorkerService } from './outbox-worker.service';

@Module({
  imports: [DatabaseModule, FirebaseAdminModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPreferencesService,
    DeviceRegistrationsService,
    OutboxWorkerService,
    OutboxEventService,
  ],
  exports: [
    NotificationsService,
    NotificationPreferencesService,
    DeviceRegistrationsService,
    OutboxWorkerService,
    OutboxEventService,
  ],
})
export class NotificationsModule {}
