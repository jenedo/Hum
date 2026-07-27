import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';

@Module({
  imports: [PharmacyModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, SandboxPaymentProvider],
  exports: [PaymentsService, SandboxPaymentProvider],
})
export class PaymentsModule {}
