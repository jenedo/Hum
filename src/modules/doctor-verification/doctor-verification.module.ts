import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuditModule } from '../audit/audit.module';
import { DoctorVerificationController } from './doctor-verification.controller';
import { DoctorVerificationService } from './doctor-verification.service';

@Module({
  imports: [AuditModule, SupabaseModule],
  controllers: [DoctorVerificationController],
  providers: [DoctorVerificationService],
  exports: [DoctorVerificationService],
})
export class DoctorVerificationModule {}
