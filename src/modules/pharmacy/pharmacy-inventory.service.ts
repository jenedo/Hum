import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PharmacyInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async reserveStock(
    tx: Prisma.TransactionClient,
    items: Array<{ productId: string; quantity: number }>,
    orderId: string,
    expiresAt: Date,
  ) {
    const reservations = [];

    for (const item of items) {
      const inventory = await tx.productInventory.findUnique({
        where: { productId: item.productId },
      });

      const quantityOnHand = inventory?.quantityOnHand ?? 0;
      const quantityReserved = inventory?.quantityReserved ?? 0;
      const availableStock = quantityOnHand - quantityReserved;

      if (!inventory || availableStock < item.quantity) {
        throw new ConflictException(
          `Insufficient stock for product ${item.productId}`,
        );
      }

      await tx.productInventory.update({
        where: { productId: item.productId },
        data: {
          quantityReserved: { increment: item.quantity },
        },
      });

      const reservation = await tx.inventoryReservation.create({
        data: {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          status: ReservationStatus.HELD,
          expiresAt,
        },
      });

      reservations.push(reservation);
    }

    return reservations;
  }

  async releaseReservation(tx: Prisma.TransactionClient, orderId: string) {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        orderId,
        status: ReservationStatus.HELD,
      },
    });

    for (const reservation of reservations) {
      await tx.productInventory.update({
        where: { productId: reservation.productId },
        data: {
          quantityReserved: { decrement: reservation.quantity },
        },
      });

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
    }
  }

  async consumeReservation(tx: Prisma.TransactionClient, orderId: string) {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        orderId,
        status: ReservationStatus.HELD,
      },
    });

    for (const reservation of reservations) {
      await tx.productInventory.update({
        where: { productId: reservation.productId },
        data: {
          quantityOnHand: { decrement: reservation.quantity },
          quantityReserved: { decrement: reservation.quantity },
        },
      });

      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.CONSUMED,
          consumedAt: new Date(),
        },
      });
    }
  }

  async expireStaleReservations() {
    const staleReservations = await this.prisma.inventoryReservation.findMany({
      where: {
        status: ReservationStatus.HELD,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (staleReservations.length === 0) {
      return { expiredCount: 0 };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const reservation of staleReservations) {
        await tx.productInventory.update({
          where: { productId: reservation.productId },
          data: {
            quantityReserved: { decrement: reservation.quantity },
          },
        });

        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: {
            status: ReservationStatus.EXPIRED,
          },
        });
      }
    });

    return { expiredCount: staleReservations.length };
  }
}
