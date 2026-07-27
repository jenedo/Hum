/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PharmacyOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OutboxEventService } from '../notifications/outbox-event.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PharmacyCartService } from './pharmacy-cart.service';
import { PharmacyInventoryService } from './pharmacy-inventory.service';
import { PharmacyOrderService } from './pharmacy-order.service';

type MockPrisma = {
  pharmacyOrder: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  pharmacyOrderItem: {
    createMany: jest.Mock;
  };
  deliveryAddress: {
    findFirst: jest.Mock;
  };
  prescription: {
    findFirst: jest.Mock;
  };
  pharmacyProduct: {
    findMany: jest.Mock;
  };
  orderStatusHistory: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('PharmacyOrderService Unit Tests', () => {
  let service: PharmacyOrderService;
  let mockPrisma: MockPrisma;
  let mockCartService: Partial<PharmacyCartService>;
  let mockInventoryService: Partial<PharmacyInventoryService>;
  let mockOutboxEventService: Partial<OutboxEventService>;

  beforeEach(() => {
    mockPrisma = {
      pharmacyOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      pharmacyOrderItem: {
        createMany: jest.fn(),
      },
      deliveryAddress: {
        findFirst: jest.fn(),
      },
      prescription: {
        findFirst: jest.fn(),
      },
      pharmacyProduct: {
        findMany: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn(
        async <T>(
          cb: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
          const res = await cb(
            mockPrisma as unknown as Prisma.TransactionClient,
          );
          return res;
        },
      ),
    };

    mockCartService = {
      getCartWithTotals: jest.fn(),
      clearCart: jest.fn(),
    };

    mockInventoryService = {
      reserveStock: jest.fn(),
      releaseReservation: jest.fn(),
    };

    mockOutboxEventService = {
      createEvent: jest.fn(),
    };

    service = new PharmacyOrderService(
      mockPrisma as unknown as PrismaService,
      mockCartService as PharmacyCartService,
      mockInventoryService as PharmacyInventoryService,
      mockOutboxEventService as OutboxEventService,
    );
  });

  describe('createOrder', () => {
    it('returns existing order on duplicate idempotencyKey', async () => {
      const existingOrder = {
        id: 'order-1',
        orderNumber: 'AC-123',
        idempotencyKey: 'idemp-key-1',
        status: PharmacyOrderStatus.PENDING_PAYMENT,
      };
      mockPrisma.pharmacyOrder.findUnique.mockResolvedValue(existingOrder);

      const dto: CreateOrderDto = {
        deliveryAddressId: 'addr-1',
        idempotencyKey: 'idemp-key-1',
      };

      const result = await service.createOrder('user-1', 'pat-1', dto);

      expect(result).toEqual(existingOrder);
      expect(mockCartService.getCartWithTotals).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for empty cart', async () => {
      mockPrisma.pharmacyOrder.findUnique.mockResolvedValue(null);
      (mockCartService.getCartWithTotals as jest.Mock).mockResolvedValue({
        items: [],
      });

      const dto: CreateOrderDto = {
        deliveryAddressId: 'addr-1',
        idempotencyKey: 'idemp-key-new',
      };

      await expect(service.createOrder('user-1', 'pat-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for unowned address', async () => {
      mockPrisma.pharmacyOrder.findUnique.mockResolvedValue(null);
      (mockCartService.getCartWithTotals as jest.Mock).mockResolvedValue({
        items: [{ productId: 'prod-1', quantity: 1, product: {} }],
      });
      mockPrisma.deliveryAddress.findFirst.mockResolvedValue(null);

      const dto: CreateOrderDto = {
        deliveryAddressId: 'unowned-addr',
        idempotencyKey: 'idemp-key-new',
      };

      await expect(service.createOrder('user-1', 'pat-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('requires prescriptionId when item needs prescription', async () => {
      mockPrisma.pharmacyOrder.findUnique.mockResolvedValue(null);
      (mockCartService.getCartWithTotals as jest.Mock).mockResolvedValue({
        items: [
          {
            productId: 'prod-rx',
            quantity: 1,
            product: { prescriptionRequired: true },
          },
        ],
      });
      mockPrisma.deliveryAddress.findFirst.mockResolvedValue({
        id: 'addr-1',
        patientId: 'pat-1',
      });

      const dto: CreateOrderDto = {
        deliveryAddressId: 'addr-1',
        idempotencyKey: 'idemp-key-new',
      };

      await expect(service.createOrder('user-1', 'pat-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('server-recalculates prices and creates OrderStatusHistory entry', async () => {
      mockPrisma.pharmacyOrder.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'order-new',
          orderNumber: 'AC-999',
          totalMinor: 1000,
          status: PharmacyOrderStatus.PENDING_PAYMENT,
          items: [],
          statusHistory: [],
        });

      (mockCartService.getCartWithTotals as jest.Mock).mockResolvedValue({
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            product: { prescriptionRequired: false },
          },
        ],
      });

      mockPrisma.deliveryAddress.findFirst.mockResolvedValue({
        id: 'addr-1',
        recipientName: 'Ali Khan',
        phone: '03001234567',
        addressLine1: 'Street 1',
        city: 'Lahore',
        province: 'Punjab',
      });

      mockPrisma.pharmacyProduct.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          sku: 'PAN-500',
          brandName: 'Panadol',
          genericName: 'Paracetamol',
          strength: '500mg',
          dosageForm: 'Tablet',
          prescriptionRequired: false,
          unitPriceMinor: 500, // DB price = 500 minor units
        },
      ]);

      mockPrisma.pharmacyOrder.create.mockResolvedValue({
        id: 'order-new',
      });

      const dto: CreateOrderDto = {
        deliveryAddressId: 'addr-1',
        idempotencyKey: 'idemp-key-unique',
      };

      const result = await service.createOrder('user-1', 'pat-1', dto);

      expect(mockPrisma.pharmacyOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subtotalMinor: 1000,
          totalMinor: 1000,
          status: PharmacyOrderStatus.PENDING_PAYMENT,
        }),
      });

      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-new',
          toStatus: PharmacyOrderStatus.PENDING_PAYMENT,
        }),
      });

      expect(mockInventoryService.reserveStock).toHaveBeenCalled();
      expect(mockCartService.clearCart).toHaveBeenCalled();
      expect(mockOutboxEventService.createEvent).toHaveBeenCalled();
      expect(result?.id).toBe('order-new');
    });
  });

  describe('cancelOrder', () => {
    it('throws BadRequestException for non-cancellable status', async () => {
      mockPrisma.pharmacyOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        patientId: 'pat-1',
        status: PharmacyOrderStatus.DELIVERED,
      });

      await expect(
        service.cancelOrder('user-1', 'pat-1', 'order-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels PENDING_PAYMENT order and releases inventory reservation', async () => {
      mockPrisma.pharmacyOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        patientId: 'pat-1',
        status: PharmacyOrderStatus.PENDING_PAYMENT,
      });

      mockPrisma.pharmacyOrder.update.mockResolvedValue({
        id: 'order-1',
        status: PharmacyOrderStatus.CANCELLED,
      });

      mockPrisma.pharmacyOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: PharmacyOrderStatus.CANCELLED,
        items: [],
        statusHistory: [],
      });

      const result = await service.cancelOrder('user-1', 'pat-1', 'order-1');

      expect(mockPrisma.pharmacyOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: PharmacyOrderStatus.CANCELLED },
      });
      expect(mockInventoryService.releaseReservation).toHaveBeenCalledWith(
        expect.anything(),
        'order-1',
      );
      expect(mockOutboxEventService.createEvent).toHaveBeenCalled();
      expect(result?.status).toBe(PharmacyOrderStatus.CANCELLED);
    });
  });
});
