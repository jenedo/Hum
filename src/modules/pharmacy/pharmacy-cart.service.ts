import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto';

@Injectable()
export class PharmacyCartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCart(patientId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: {
        patientId_currency: {
          patientId,
          currency: 'PKR',
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                inventory: true,
              },
            },
          },
          orderBy: { addedAt: 'asc' },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          patientId,
          currency: 'PKR',
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  inventory: true,
                },
              },
            },
            orderBy: { addedAt: 'asc' },
          },
        },
      });
    }

    return cart;
  }

  async addItem(patientId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(patientId);

    const product = await this.prisma.pharmacyProduct.findFirst({
      where: {
        id: dto.productId,
        isActive: true,
      },
      include: {
        inventory: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Pharmacy product not found or inactive');
    }

    const availableStock = Math.max(
      0,
      (product.inventory?.quantityOnHand ?? 0) -
        (product.inventory?.quantityReserved ?? 0),
    );

    if (availableStock <= 0) {
      throw new BadRequestException('Product is out of stock');
    }

    const existingItem = cart.items.find(
      (item) => item.productId === dto.productId,
    );

    if (existingItem) {
      const newQuantity = Math.min(99, existingItem.quantity + dto.quantity);
      if (availableStock < newQuantity) {
        throw new BadRequestException(
          `Insufficient stock available (requested: ${newQuantity}, available: ${availableStock})`,
        );
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      if (availableStock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock available (requested: ${dto.quantity}, available: ${availableStock})`,
        );
      }

      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCartWithTotals(patientId);
  }

  async updateItem(
    patientId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = await this.getOrCreateCart(patientId);

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundException('Item not found in cart');
    }

    const availableStock = Math.max(
      0,
      (item.product.inventory?.quantityOnHand ?? 0) -
        (item.product.inventory?.quantityReserved ?? 0),
    );

    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `Insufficient stock available (requested: ${dto.quantity}, available: ${availableStock})`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });

    return this.getCartWithTotals(patientId);
  }

  async removeItem(patientId: string, productId: string) {
    const cart = await this.getOrCreateCart(patientId);

    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      throw new NotFoundException('Item not found in cart');
    }

    await this.prisma.cartItem.delete({
      where: { id: item.id },
    });

    return this.getCartWithTotals(patientId);
  }

  async clearCart(patientId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const cart = await client.cart.findFirst({
      where: { patientId, currency: 'PKR' },
    });

    if (cart) {
      await client.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }
  }

  async getCartWithTotals(patientId: string) {
    const cart = await this.getOrCreateCart(patientId);

    const items = cart.items.map((item) => {
      const lineTotalMinor = item.quantity * item.product.unitPriceMinor;
      const availableStock = Math.max(
        0,
        (item.product.inventory?.quantityOnHand ?? 0) -
          (item.product.inventory?.quantityReserved ?? 0),
      );

      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        addedAt: item.addedAt,
        product: {
          id: item.product.id,
          sku: item.product.sku,
          brandName: item.product.brandName,
          genericName: item.product.genericName,
          dosageForm: item.product.dosageForm,
          strength: item.product.strength,
          prescriptionRequired: item.product.prescriptionRequired,
          unitPriceMinor: item.product.unitPriceMinor,
          imageUrl: item.product.imageUrl,
          availableStock,
        },
        lineTotalMinor,
      };
    });

    const subtotalMinor = items.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0,
    );
    const deliveryFeeMinor = 0;
    const totalMinor = subtotalMinor + deliveryFeeMinor;

    return {
      id: cart.id,
      patientId: cart.patientId,
      currency: cart.currency,
      items,
      subtotalMinor,
      deliveryFeeMinor,
      totalMinor,
    };
  }
}
