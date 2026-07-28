-- CreateEnum
CREATE TYPE "InventoryBatchStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'RECALLED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVATION', 'RESERVATION_RELEASE', 'SALE', 'RETURN', 'EXPIRED', 'DAMAGED', 'RECALLED');

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "purchasePriceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "supplierReference" TEXT,
    "status" "InventoryBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DeliveryAddress" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN "batchId" TEXT;

-- AlterTable
ALTER TABLE "PharmacyOrder"
ADD COLUMN "addressLine1Snap" TEXT NOT NULL,
ADD COLUMN "addressLine2Snap" TEXT,
ADD COLUMN "postalCodeSnap" TEXT,
ADD COLUMN "provinceSnap" TEXT NOT NULL,
ADD COLUMN "recipientPhoneSnap" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PharmacyOrderItem"
ADD COLUMN "brandNameSnap" TEXT NOT NULL,
ADD COLUMN "dosageFormSnap" TEXT NOT NULL,
ADD COLUMN "genericNameSnap" TEXT NOT NULL,
ADD COLUMN "prescriptionRequiredSnap" BOOLEAN NOT NULL,
ADD COLUMN "strengthSnap" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_productId_batchNumber_key" ON "InventoryBatch"("productId", "batchNumber");
CREATE INDEX "InventoryBatch_productId_status_expiryDate_idx" ON "InventoryBatch"("productId", "status", "expiryDate");
CREATE INDEX "InventoryBatch_expiryDate_status_idx" ON "InventoryBatch"("expiryDate", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX "InventoryMovement_batchId_createdAt_idx" ON "InventoryMovement"("batchId", "createdAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");
CREATE INDEX "InventoryReservation_orderId_idx" ON "InventoryReservation"("orderId");
CREATE INDEX "InventoryReservation_productId_idx" ON "InventoryReservation"("productId");
CREATE INDEX "InventoryReservation_batchId_idx" ON "InventoryReservation"("batchId");

-- CreateIndex
CREATE INDEX "PharmacyProduct_categoryId_isActive_idx" ON "PharmacyProduct"("categoryId", "isActive");
CREATE INDEX "PharmacyProduct_isActive_brandName_idx" ON "PharmacyProduct"("isActive", "brandName");
CREATE INDEX "PharmacyProduct_isActive_genericName_idx" ON "PharmacyProduct"("isActive", "genericName");

-- CreateIndex
CREATE INDEX "ProductInventory_quantityOnHand_idx" ON "ProductInventory"("quantityOnHand");
CREATE INDEX "ProductInventory_quantityReserved_idx" ON "ProductInventory"("quantityReserved");

-- CreateIndex
CREATE INDEX "Cart_patientId_currency_idx" ON "Cart"("patientId", "currency");

-- CreateIndex
CREATE INDEX "DeliveryAddress_patientId_deletedAt_idx" ON "DeliveryAddress"("patientId", "deletedAt");
CREATE UNIQUE INDEX "DeliveryAddress_patientId_default_unique" ON "DeliveryAddress" ("patientId") WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "PharmacyOrder_patientId_createdAt_idx" ON "PharmacyOrder"("patientId", "createdAt");
CREATE INDEX "PharmacyOrder_patientId_status_idx" ON "PharmacyOrder"("patientId", "status");
CREATE INDEX "PharmacyOrder_status_createdAt_idx" ON "PharmacyOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PharmacyProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database Check Constraints
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "batch_on_hand_non_negative" CHECK ("quantityOnHand" >= 0);
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "batch_reserved_non_negative" CHECK ("quantityReserved" >= 0);
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "batch_available_non_negative" CHECK ("quantityOnHand" >= "quantityReserved");
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "batch_purchase_price_non_negative" CHECK ("purchasePriceMinor" IS NULL OR "purchasePriceMinor" >= 0);

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "movement_delta_non_zero" CHECK ("quantityDelta" <> 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "movement_after_non_negative" CHECK ("quantityAfter" >= 0);

ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_positive_qty" CHECK ("quantity" > 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_mutually_exclusive_release_consume" CHECK (NOT ("releasedAt" IS NOT NULL AND "consumedAt" IS NOT NULL));
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_consumed_timestamp_required" CHECK ("status" <> 'CONSUMED' OR "consumedAt" IS NOT NULL);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "reservation_released_timestamp_required" CHECK ("status" NOT IN ('RELEASED', 'EXPIRED') OR "releasedAt" IS NOT NULL);

ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "product_positive_pack_size" CHECK ("packSize" > 0);
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "product_non_negative_price" CHECK ("unitPriceMinor" >= 0);
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "product_non_blank_currency" CHECK (length(trim("currency")) > 0);

ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "order_non_negative_subtotal" CHECK ("subtotalMinor" >= 0);
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "order_non_negative_delivery_fee" CHECK ("deliveryFeeMinor" >= 0);
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "order_non_negative_discount" CHECK ("discountMinor" >= 0);
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "order_non_negative_total" CHECK ("totalMinor" >= 0);
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "order_total_matches_components" CHECK ("totalMinor" = "subtotalMinor" + "deliveryFeeMinor" - "discountMinor");

ALTER TABLE "PharmacyOrderItem" ADD CONSTRAINT "order_item_line_total_non_negative" CHECK ("lineTotalMinor" >= 0);
ALTER TABLE "PharmacyOrderItem" ADD CONSTRAINT "order_item_line_total_matches_qty_price" CHECK ("lineTotalMinor" = "unitPriceSnap" * "quantity");

-- Search Support (pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "PharmacyProduct_searchText_trgm_idx" ON "PharmacyProduct" USING gin ("searchText" gin_trgm_ops);

-- RLS and Privileges
ALTER TABLE "InventoryBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "InventoryBatch" FROM anon, authenticated;
REVOKE ALL ON TABLE "InventoryMovement" FROM anon, authenticated;
