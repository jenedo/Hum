import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PharmacyProduct, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';

export interface ProductWithStock extends PharmacyProduct {
  availableStock: number;
}

@Injectable()
export class PharmacyCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories() {
    const categories = await this.prisma.pharmacyCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      sortOrder: cat.sortOrder,
      productCount: cat._count.products,
    }));
  }

  async getProducts(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PharmacyProductWhereInput = {
      isActive: true,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.prescriptionRequired !== undefined) {
      where.prescriptionRequired = query.prescriptionRequired;
    }

    if (query.search && query.search.trim().length > 0) {
      where.searchText = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [total, products] = await Promise.all([
      this.prisma.pharmacyProduct.count({ where }),
      this.prisma.pharmacyProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          inventory: {
            select: {
              quantityOnHand: true,
              quantityReserved: true,
            },
          },
        },
      }),
    ]);

    const data = products.map((product) => {
      const quantityOnHand = product.inventory?.quantityOnHand ?? 0;
      const quantityReserved = product.inventory?.quantityReserved ?? 0;
      const availableStock = Math.max(0, quantityOnHand - quantityReserved);

      return {
        ...product,
        availableStock,
      };
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async getProductById(id: string) {
    const product = await this.prisma.pharmacyProduct.findFirst({
      where: {
        id,
        isActive: true,
      },
      include: {
        category: true,
        inventory: {
          select: {
            quantityOnHand: true,
            quantityReserved: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Pharmacy product not found or inactive');
    }

    const quantityOnHand = product.inventory?.quantityOnHand ?? 0;
    const quantityReserved = product.inventory?.quantityReserved ?? 0;
    const availableStock = Math.max(0, quantityOnHand - quantityReserved);

    return {
      ...product,
      availableStock,
    };
  }

  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.pharmacyCategory.findFirst({
      where: {
        OR: [{ name: dto.name }, { slug: dto.slug }],
      },
    });

    if (existing) {
      throw new ConflictException('Category name or slug already exists');
    }

    return this.prisma.pharmacyCategory.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async createProduct(dto: CreateProductDto) {
    const category = await this.prisma.pharmacyCategory.findFirst({
      where: { id: dto.categoryId, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const existingSku = await this.prisma.pharmacyProduct.findUnique({
      where: { sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException('Product SKU already exists');
    }

    const searchText = `${dto.brandName} ${dto.genericName} ${dto.sku}`;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const product = await tx.pharmacyProduct.create({
        data: {
          categoryId: dto.categoryId,
          sku: dto.sku,
          genericName: dto.genericName,
          brandName: dto.brandName,
          strength: dto.strength,
          dosageForm: dto.dosageForm,
          manufacturer: dto.manufacturer,
          packSize: dto.packSize,
          prescriptionRequired: dto.prescriptionRequired,
          unitPriceMinor: dto.unitPriceMinor,
          description: dto.description,
          imageUrl: dto.imageUrl,
          searchText,
        },
      });

      const inventory = await tx.productInventory.create({
        data: {
          productId: product.id,
          quantityOnHand: dto.initialStock,
          quantityReserved: 0,
        },
      });

      const availableStock = Math.max(
        0,
        inventory.quantityOnHand - inventory.quantityReserved,
      );

      return {
        ...product,
        inventory: {
          quantityOnHand: inventory.quantityOnHand,
          quantityReserved: inventory.quantityReserved,
        },
        availableStock,
      };
    });
  }

  async updateProductStock(productId: string, delta: number) {
    const inventory = await this.prisma.productInventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      throw new NotFoundException('Product inventory record not found');
    }

    const newQuantity = inventory.quantityOnHand + delta;
    if (newQuantity < 0) {
      throw new ConflictException('Insufficient stock for adjustment');
    }

    return this.prisma.productInventory.update({
      where: { productId },
      data: {
        quantityOnHand: newQuantity,
      },
    });
  }
}
