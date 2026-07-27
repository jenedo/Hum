/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { PharmacyCatalogService } from './pharmacy-catalog.service';

type MockPrisma = {
  pharmacyCategory: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  pharmacyProduct: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  productInventory: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('PharmacyCatalogService Unit Tests', () => {
  let service: PharmacyCatalogService;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      pharmacyCategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      pharmacyProduct: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      productInventory: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
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

    service = new PharmacyCatalogService(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('getCategories', () => {
    it('returns active categories ordered by sortOrder with productCount', async () => {
      mockPrisma.pharmacyCategory.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          name: 'Pain Relief',
          slug: 'pain-relief',
          description: 'Painkillers',
          imageUrl: null,
          sortOrder: 1,
          _count: { products: 5 },
        },
      ]);

      const result = await service.getCategories();

      expect(mockPrisma.pharmacyCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      expect(result).toEqual([
        {
          id: 'cat-1',
          name: 'Pain Relief',
          slug: 'pain-relief',
          description: 'Painkillers',
          imageUrl: null,
          sortOrder: 1,
          productCount: 5,
        },
      ]);
    });
  });

  describe('getProducts', () => {
    it('returns paginated results with computed availableStock', async () => {
      const query: ProductQueryDto = { page: 1, limit: 10 };
      mockPrisma.pharmacyProduct.count.mockResolvedValue(1);
      mockPrisma.pharmacyProduct.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          brandName: 'Panadol',
          genericName: 'Paracetamol',
          sku: 'PAN-500',
          inventory: { quantityOnHand: 50, quantityReserved: 10 },
        },
      ]);

      const result = await service.getProducts(query);

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.data[0].availableStock).toBe(40);
    });

    it('filters by categoryId', async () => {
      const query: ProductQueryDto = { categoryId: 'cat-1' };
      mockPrisma.pharmacyProduct.count.mockResolvedValue(0);
      mockPrisma.pharmacyProduct.findMany.mockResolvedValue([]);

      await service.getProducts(query);

      expect(mockPrisma.pharmacyProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-1' }),
        }),
      );
    });

    it('filters by search text case-insensitively', async () => {
      const query: ProductQueryDto = { search: 'panadol' };
      mockPrisma.pharmacyProduct.count.mockResolvedValue(0);
      mockPrisma.pharmacyProduct.findMany.mockResolvedValue([]);

      await service.getProducts(query);

      expect(mockPrisma.pharmacyProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            searchText: { contains: 'panadol', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('getProductById', () => {
    it('throws NotFoundException for inactive or missing product', async () => {
      mockPrisma.pharmacyProduct.findFirst.mockResolvedValue(null);

      await expect(service.getProductById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns product detail with availableStock computed correctly', async () => {
      mockPrisma.pharmacyProduct.findFirst.mockResolvedValue({
        id: 'prod-1',
        brandName: 'Panadol',
        inventory: { quantityOnHand: 100, quantityReserved: 15 },
      });

      const result = await service.getProductById('prod-1');

      expect(result.id).toBe('prod-1');
      expect(result.availableStock).toBe(85);
    });
  });

  describe('createCategory', () => {
    it('throws ConflictException if category name or slug exists', async () => {
      const dto: CreateCategoryDto = {
        name: 'Pain Relief',
        slug: 'pain-relief',
      };
      mockPrisma.pharmacyCategory.findFirst.mockResolvedValue({
        id: 'existing',
      });

      await expect(service.createCategory(dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('createProduct', () => {
    it('throws ConflictException for duplicate SKU', async () => {
      const dto: CreateProductDto = {
        categoryId: 'cat-1',
        sku: 'PAN-500',
        genericName: 'Paracetamol',
        brandName: 'Panadol',
        dosageForm: 'Tablet',
        packSize: 10,
        prescriptionRequired: false,
        unitPriceMinor: 500,
        initialStock: 100,
      };

      mockPrisma.pharmacyCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.pharmacyProduct.findUnique.mockResolvedValue({
        id: 'existing-prod',
      });

      await expect(service.createProduct(dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates product and inventory record inside a transaction', async () => {
      const dto: CreateProductDto = {
        categoryId: 'cat-1',
        sku: 'PAN-500',
        genericName: 'Paracetamol',
        brandName: 'Panadol',
        dosageForm: 'Tablet',
        packSize: 10,
        prescriptionRequired: false,
        unitPriceMinor: 500,
        initialStock: 100,
      };

      mockPrisma.pharmacyCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.pharmacyProduct.findUnique.mockResolvedValue(null);
      mockPrisma.pharmacyProduct.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'prod-new',
            ...args.data,
          }),
      );
      mockPrisma.productInventory.create.mockResolvedValue({
        id: 'inv-new',
        productId: 'prod-new',
        quantityOnHand: 100,
        quantityReserved: 0,
      });

      const productResult = await service.createProduct(dto);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.pharmacyProduct.create).toHaveBeenCalled();
      expect(mockPrisma.productInventory.create).toHaveBeenCalledWith({
        data: {
          productId: 'prod-new',
          quantityOnHand: 100,
          quantityReserved: 0,
        },
      });
      expect(productResult.availableStock).toBe(100);
    });
  });
});
