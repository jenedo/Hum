/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto';
import { PharmacyCartService } from './pharmacy-cart.service';

type MockPrisma = {
  cart: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  cartItem: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  pharmacyProduct: {
    findFirst: jest.Mock;
  };
};

describe('PharmacyCartService Unit Tests', () => {
  let service: PharmacyCartService;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      cart: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      cartItem: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      pharmacyProduct: {
        findFirst: jest.fn(),
      },
    };

    service = new PharmacyCartService(mockPrisma as unknown as PrismaService);
  });

  describe('getOrCreateCart', () => {
    it('creates new cart if none exists', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue(null);
      mockPrisma.cart.create.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [],
      });

      const cart = await service.getOrCreateCart('pat-1');

      expect(mockPrisma.cart.create).toHaveBeenCalledWith({
        data: { patientId: 'pat-1', currency: 'PKR' },
        include: expect.any(Object),
      });
      expect(cart.id).toBe('cart-1');
    });
  });

  describe('addItem', () => {
    it('throws NotFoundException if product is missing or inactive', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [],
      });
      mockPrisma.pharmacyProduct.findFirst.mockResolvedValue(null);

      const dto: AddCartItemDto = { productId: 'prod-999', quantity: 2 };

      await expect(service.addItem('pat-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('adds product to cart when active and in stock', async () => {
      const mockCart = {
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [],
      };
      mockPrisma.cart.findUnique.mockResolvedValue(mockCart);
      mockPrisma.pharmacyProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        unitPriceMinor: 500,
        inventory: { quantityOnHand: 10, quantityReserved: 0 },
      });
      mockPrisma.cartItem.create.mockResolvedValue({
        id: 'item-1',
        cartId: 'cart-1',
        productId: 'prod-1',
        quantity: 2,
      });

      const result = await service.addItem('pat-1', {
        productId: 'prod-1',
        quantity: 2,
      });

      expect(mockPrisma.cartItem.create).toHaveBeenCalledWith({
        data: {
          cartId: 'cart-1',
          productId: 'prod-1',
          quantity: 2,
        },
      });
      expect(result.id).toBe('cart-1');
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [],
      });
      mockPrisma.pharmacyProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        inventory: { quantityOnHand: 1, quantityReserved: 1 },
      });

      await expect(
        service.addItem('pat-1', { productId: 'prod-1', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateItem', () => {
    it('throws NotFoundException for item not in cart', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        items: [],
      });

      const dto: UpdateCartItemDto = { quantity: 3 };

      await expect(
        service.updateItem('pat-1', 'prod-missing', dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('deletes cart item', async () => {
      const mockItem = {
        id: 'item-1',
        productId: 'prod-1',
        quantity: 2,
        product: { unitPriceMinor: 100, inventory: {} },
      };
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        items: [mockItem],
      });
      mockPrisma.cartItem.delete.mockResolvedValue(mockItem);

      await service.removeItem('pat-1', 'prod-1');

      expect(mockPrisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });
  });

  describe('getCartWithTotals', () => {
    it('returns 0 subtotal for empty cart', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [],
      });

      const result = await service.getCartWithTotals('pat-1');

      expect(result.subtotalMinor).toBe(0);
      expect(result.totalMinor).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('computes subtotal and total correctly for items', async () => {
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        patientId: 'pat-1',
        currency: 'PKR',
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 3,
            addedAt: new Date(),
            product: {
              id: 'prod-1',
              sku: 'PAN-500',
              brandName: 'Panadol',
              genericName: 'Paracetamol',
              dosageForm: 'Tablet',
              strength: '500mg',
              prescriptionRequired: false,
              unitPriceMinor: 150,
              imageUrl: null,
              inventory: { quantityOnHand: 20, quantityReserved: 2 },
            },
          },
        ],
      });

      const result = await service.getCartWithTotals('pat-1');

      expect(result.subtotalMinor).toBe(450); // 3 * 150
      expect(result.totalMinor).toBe(450);
      expect(result.items[0].lineTotalMinor).toBe(450);
      expect(result.items[0].product.availableStock).toBe(18);
    });
  });
});
