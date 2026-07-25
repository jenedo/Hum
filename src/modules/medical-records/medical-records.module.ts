import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../supabase/supabase.module';
import { MedicalFileValidationService } from './medical-file-validation.service';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService, MedicalFileValidationService],
  exports: [MedicalRecordsService, MedicalFileValidationService],
})
export class MedicalRecordsModule {}
