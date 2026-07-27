import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, PharmacyOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OutboxEventService } from '../notifications/outbox-event.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PharmacyCartService } from './pharmacy-cart.service';
import { PharmacyInventoryService } from './pharmacy-inventory.service';

@Injectable()
export class PharmacyOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: PharmacyCartService,
    private readonly inventoryService: PharmacyInventoryService,
    private readonly outboxEventService: OutboxEventService,
  ) {}

  async createOrder(userId: string, patientId: string, dto: CreateOrderDto) {
    // STEP 1 — Idempotency check
    const existingOrder = await this.prisma.pharmacyOrder.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        items: true,
        statusHistory: true,
      },
    });

    if (existingOrder) {
      return existingOrder;
    }

    // STEP 2 — Load cart with totals
    const cart = await this.cartService.getCartWithTotals(patientId);
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // STEP 3 — Validate delivery address
    const address = await this.prisma.deliveryAddress.findFirst({
      where: {
        id: dto.deliveryAddressId,
        patientId,
        deletedAt: null,
      },
    });

    if (!address) {
      throw new NotFoundException('Delivery address not found or not owned');
    }

    // STEP 4 — Validate prescription if required
    const requiresPrescription = cart.items.some(
      (item) => item.product.prescriptionRequired,
    );

    if (requiresPrescription) {
      if (!dto.prescriptionId) {
        throw new BadRequestException(
          'Prescription required for one or more items in cart',
        );
      }

      const prescription = await this.prisma.prescription.findFirst({
        where: {
          id: dto.prescriptionId,
          status: 'ISSUED',
        },
        include: {
          patientProfile: {
            select: { userId: true, id: true },
          },
        },
      });

      if (
        !prescription ||
        (prescription.patientProfile.userId !== userId &&
          prescription.patientProfileId !== patientId)
      ) {
        throw new BadRequestException(
          'Invalid, expired, or non-ISSUED prescription provided',
        );
      }
    }

    // STEP 5 — Server-side price recalculation (reloading DB products)
    const productIds = cart.items.map((item) => item.productId);
    const dbProducts = await this.prisma.pharmacyProduct.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
      },
    });

    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]));

    const calculatedItems = cart.items.map((item) => {
      const dbProduct = dbProductMap.get(item.productId);
      if (!dbProduct) {
        throw new NotFoundException(
          `Product ${item.productId} no longer exists or is inactive`,
        );
      }

      const unitPriceSnap = dbProduct.unitPriceMinor;
      const lineTotalMinor = item.quantity * unitPriceSnap;

      return {
        cartItem: item,
        dbProduct,
        unitPriceSnap,
        lineTotalMinor,
      };
    });

    const subtotalMinor = calculatedItems.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0,
    );
    const deliveryFeeMinor = 0;
    const totalMinor = subtotalMinor + deliveryFeeMinor;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes reservation

    // STEP 6 — Transaction execution
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const random4 = Math.floor(1000 + Math.random() * 9000).toString();
      const orderNumber = `AC-${Date.now()}-${random4}`;

      const addressSnapStr = `${address.addressLine1}, ${address.city}, ${address.province}`;

      const order = await tx.pharmacyOrder.create({
        data: {
          orderNumber,
          patientId,
          deliveryAddressId: address.id,
          prescriptionId: dto.prescriptionId ?? null,
          status: PharmacyOrderStatus.PENDING_PAYMENT,
          subtotalMinor,
          deliveryFeeMinor,
          totalMinor,
          idempotencyKey: dto.idempotencyKey,
          recipientNameSnap: address.recipientName,
          recipientPhoneSnap: address.phone,
          addressSnap: addressSnapStr,
          addressLine1Snap: address.addressLine1,
          addressLine2Snap: address.addressLine2,
          citySnap: address.city,
          provinceSnap: address.province,
          postalCodeSnap: address.postalCode,
        },
      });

      const orderItemData = calculatedItems.map((ci) => ({
        orderId: order.id,
        productId: ci.dbProduct.id,
        skuSnap: ci.dbProduct.sku,
        productNameSnap: `${ci.dbProduct.brandName} (${ci.dbProduct.genericName})`,
        brandNameSnap: ci.dbProduct.brandName,
        genericNameSnap: ci.dbProduct.genericName,
        strengthSnap: ci.dbProduct.strength,
        dosageFormSnap: ci.dbProduct.dosageForm,
        prescriptionRequiredSnap: ci.dbProduct.prescriptionRequired,
        unitPriceSnap: ci.unitPriceSnap,
        quantity: ci.cartItem.quantity,
        lineTotalMinor: ci.lineTotalMinor,
      }));

      await tx.pharmacyOrderItem.createMany({
        data: orderItemData,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: PharmacyOrderStatus.PENDING_PAYMENT,
          note: 'Order created via checkout',
        },
      });

      const reservationItems = calculatedItems.map((ci) => ({
        productId: ci.dbProduct.id,
        quantity: ci.cartItem.quantity,
      }));

      await this.inventoryService.reserveStock(
        tx,
        reservationItems,
        order.id,
        expiresAt,
      );

      await this.cartService.clearCart(patientId, tx);

      await this.outboxEventService.createEvent(tx, {
        eventType: NotificationType.PHARMACY_ORDER_PLACED,
        aggregateType: 'PharmacyOrder',
        aggregateId: order.id,
        userId,
        titleKey: 'notification.pharmacy.order_placed.title',
        bodyKey: 'notification.pharmacy.order_placed.body',
        entityType: 'PharmacyOrder',
        entityId: order.id,
        route: `/orders/${order.id}`,
      });

      return tx.pharmacyOrder.findUnique({
        where: { id: order.id },
        include: {
          items: true,
          statusHistory: true,
        },
      });
    });
  }

  async getOrders(patientId: string, page = 1, limit = 20) {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    const [total, data] = await Promise.all([
      this.prisma.pharmacyOrder.count({ where: { patientId } }),
      this.prisma.pharmacyOrder.findMany({
        where: { patientId },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          statusHistory: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  async getOrderById(patientId: string, orderId: string) {
    const order = await this.prisma.pharmacyOrder.findFirst({
      where: {
        id: orderId,
        patientId,
      },
      include: {
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        reservations: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pharmacy order not found or not owned');
    }

    return order;
  }

  async cancelOrder(userId: string, patientId: string, orderId: string) {
    const order = await this.prisma.pharmacyOrder.findFirst({
      where: {
        id: orderId,
        patientId,
      },
    });

    if (!order) {
      throw new NotFoundException('Pharmacy order not found or not owned');
    }

    const cancellableStatuses: PharmacyOrderStatus[] = [
      PharmacyOrderStatus.PENDING_PAYMENT,
      PharmacyOrderStatus.PAID,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled from status ${order.status}`,
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.pharmacyOrder.update({
        where: { id: orderId },
        data: {
          status: PharmacyOrderStatus.CANCELLED,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: PharmacyOrderStatus.CANCELLED,
          changedBy: userId,
          note: 'Order cancelled by patient',
        },
      });

      await this.inventoryService.releaseReservation(tx, orderId);

      await this.outboxEventService.createEvent(tx, {
        eventType: NotificationType.PHARMACY_ORDER_STATUS_CHANGED,
        aggregateType: 'PharmacyOrder',
        aggregateId: orderId,
        userId,
        titleKey: 'notification.pharmacy.order_status_changed.title',
        bodyKey: 'notification.pharmacy.order_status_changed.body',
        entityType: 'PharmacyOrder',
        entityId: orderId,
        route: `/orders/${orderId}`,
      });

      return tx.pharmacyOrder.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          statusHistory: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });
  }
}
