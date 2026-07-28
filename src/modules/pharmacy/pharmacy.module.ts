import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryAddressController } from './delivery-address.controller';
import { DeliveryAddressService } from './delivery-address.service';
import { PharmacyCartController } from './pharmacy-cart.controller';
import { PharmacyCartService } from './pharmacy-cart.service';
import { PharmacyCatalogController } from './pharmacy-catalog.controller';
import { PharmacyCatalogService } from './pharmacy-catalog.service';
import { PharmacyInventoryService } from './pharmacy-inventory.service';
import { PharmacyOrderController } from './pharmacy-order.controller';
import { PharmacyOrderService } from './pharmacy-order.service';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [
    PharmacyCatalogController,
    PharmacyCartController,
    PharmacyOrderController,
    DeliveryAddressController,
    PharmacyController,
  ],
  providers: [
    PharmacyCatalogService,
    PharmacyInventoryService,
    PharmacyCartService,
    PharmacyOrderService,
    DeliveryAddressService,
    PharmacyService,
  ],
  exports: [
    PharmacyCatalogService,
    PharmacyInventoryService,
    PharmacyCartService,
    PharmacyOrderService,
    DeliveryAddressService,
    PharmacyService,
  ],
})
export class PharmacyModule {}
