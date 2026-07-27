/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PharmacyInventoryService } from './pharmacy-inventory.service';

type MockTxClient = {
  productInventory: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  inventoryReservation: {
    create: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
};

type MockPrisma = {
  inventoryReservation: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('PharmacyInventoryService Unit Tests', () => {
  let service: PharmacyInventoryService;
  let mockPrisma: MockPrisma;
  let mockTx: MockTxClient;

  beforeEach(() => {
    mockTx = {
      productInventory: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      inventoryReservation: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockPrisma = {
      inventoryReservation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(
        async <T>(
          cb: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
          const res = await cb(mockTx as unknown as Prisma.TransactionClient);
          return res;
        },
      ),
    };

    service = new PharmacyInventoryService(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('reserveStock', () => {
    it('throws ConflictException when stock is insufficient', async () => {
      mockTx.productInventory.findUnique.mockResolvedValue({
        quantityOnHand: 5,
        quantityReserved: 4,
      });

      const items = [{ productId: 'prod-1', quantity: 2 }];
      const expiresAt = new Date();

      await expect(
        service.reserveStock(
          mockTx as unknown as Prisma.TransactionClient,
          items,
          'order-1',
          expiresAt,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('increments quantityReserved and creates InventoryReservation with HELD status', async () => {
      mockTx.productInventory.findUnique.mockResolvedValue({
        quantityOnHand: 10,
        quantityReserved: 2,
      });
      mockTx.productInventory.update.mockResolvedValue({});
      mockTx.inventoryReservation.create.mockResolvedValue({
        id: 'res-1',
        orderId: 'order-1',
        productId: 'prod-1',
        quantity: 3,
        status: ReservationStatus.HELD,
      });

      const items = [{ productId: 'prod-1', quantity: 3 }];
      const expiresAt = new Date();

      const reservationResult = await service.reserveStock(
        mockTx as unknown as Prisma.TransactionClient,
        items,
        'order-1',
        expiresAt,
      );

      expect(mockTx.productInventory.update).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        data: { quantityReserved: { increment: 3 } },
      });
      expect(mockTx.inventoryReservation.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          productId: 'prod-1',
          quantity: 3,
          status: ReservationStatus.HELD,
          expiresAt,
        },
      });
      expect(reservationResult).toHaveLength(1);
    });
  });

  describe('releaseReservation', () => {
    it('decrements quantityReserved and sets reservation status RELEASED', async () => {
      mockTx.inventoryReservation.findMany.mockResolvedValue([
        { id: 'res-1', productId: 'prod-1', quantity: 2 },
      ]);
      mockTx.productInventory.update.mockResolvedValue({});
      mockTx.inventoryReservation.update.mockResolvedValue({});

      await service.releaseReservation(
        mockTx as unknown as Prisma.TransactionClient,
        'order-1',
      );

      expect(mockTx.productInventory.update).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        data: { quantityReserved: { decrement: 2 } },
      });
      expect(mockTx.inventoryReservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: expect.any(Date),
        },
      });
    });
  });

  describe('consumeReservation', () => {
    it('decrements both onHand and reserved and sets status CONSUMED', async () => {
      mockTx.inventoryReservation.findMany.mockResolvedValue([
        { id: 'res-1', productId: 'prod-1', quantity: 4 },
      ]);
      mockTx.productInventory.update.mockResolvedValue({});
      mockTx.inventoryReservation.update.mockResolvedValue({});

      await service.consumeReservation(
        mockTx as unknown as Prisma.TransactionClient,
        'order-1',
      );

      expect(mockTx.productInventory.update).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        data: {
          quantityOnHand: { decrement: 4 },
          quantityReserved: { decrement: 4 },
        },
      });
      expect(mockTx.inventoryReservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: {
          status: ReservationStatus.CONSUMED,
          consumedAt: expect.any(Date),
        },
      });
    });
  });
});
