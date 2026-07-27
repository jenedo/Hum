import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { PharmacyCatalogController } from './pharmacy-catalog.controller';
import { PharmacyCatalogService } from './pharmacy-catalog.service';
import { PharmacyInventoryService } from './pharmacy-inventory.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PharmacyCatalogController],
  providers: [PharmacyCatalogService, PharmacyInventoryService],
  exports: [PharmacyCatalogService, PharmacyInventoryService],
})
export class PharmacyModule {}
