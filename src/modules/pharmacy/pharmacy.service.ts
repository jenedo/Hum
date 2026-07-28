import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

export type CreatedMedicineOrder = {
  id: string;
  orderNumber: string;
  patientId: string;
  totalMinor: number;
  currency: string;
  idempotencyKey: string;
  createdAt: Date;
  items: Array<{
    medicineId: string;
    name: string;
    unitPricePkr: number;
    quantity: number;
    lineTotalMinor: number;
  }>;
};

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  async getMedicines(category?: string) {
    return this.prisma.medicine.findMany({
      where: {
        inStock: true,
        ...(category ? { category } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async getMedicineById(id: string) {
    const medicine = await this.prisma.medicine.findUnique({
      where: { id },
    });

    if (!medicine || !medicine.inStock) {
      throw new NotFoundException('Medicine not found or out of stock');
    }

    return medicine;
  }

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<CreatedMedicineOrder> {
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      throw new NotFoundException('Patient profile not found');
    }

    const existingOrder = await this.prisma.pharmacyOrder.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existingOrder) {
      if (existingOrder.patientId !== patientProfile.id) {
        throw new ForbiddenException('Order belongs to another user');
      }
      return {
        id: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        patientId: existingOrder.patientId,
        totalMinor: existingOrder.totalMinor,
        currency: existingOrder.currency,
        idempotencyKey: existingOrder.idempotencyKey,
        createdAt: existingOrder.createdAt,
        items: [],
      };
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order items must not be empty');
    }

    const medicineIds = dto.items.map((i) => i.medicineId);
    const medicines = await this.prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    const medicineMap = new Map(medicines.map((m) => [m.id, m]));

    let totalMinor = 0;
    const orderItemsJson: Array<{
      medicineId: string;
      name: string;
      unitPricePkr: number;
      quantity: number;
      lineTotalMinor: number;
    }> = [];

    for (const item of dto.items) {
      const dbMedicine = medicineMap.get(item.medicineId);
      if (!dbMedicine || !dbMedicine.inStock) {
        throw new BadRequestException(
          `Medicine ${item.medicineId} is invalid or out of stock`,
        );
      }

      const lineTotalMinor = dbMedicine.pricePkr * 100 * item.quantity;
      totalMinor += lineTotalMinor;

      orderItemsJson.push({
        medicineId: dbMedicine.id,
        name: dbMedicine.name,
        unitPricePkr: dbMedicine.pricePkr,
        quantity: item.quantity,
        lineTotalMinor,
      });
    }

    let deliveryAddress = await this.prisma.deliveryAddress.findFirst({
      where: { patientId: patientProfile.id, deletedAt: null },
    });

    if (!deliveryAddress) {
      deliveryAddress = await this.prisma.deliveryAddress.create({
        data: {
          patientId: patientProfile.id,
          label: 'Default',
          recipientName: patientProfile.fullName,
          phone: '+923000000000',
          addressLine1: 'Main Street',
          city: 'Lahore',
          province: 'Punjab',
        },
      });
    }

    const orderNumber = `MED-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = await this.prisma.pharmacyOrder.create({
      data: {
        orderNumber,
        patientId: patientProfile.id,
        deliveryAddressId: deliveryAddress.id,
        subtotalMinor: totalMinor,
        totalMinor,
        currency: 'PKR',
        idempotencyKey: dto.idempotencyKey,
        recipientNameSnap: deliveryAddress.recipientName,
        recipientPhoneSnap: deliveryAddress.phone,
        addressSnap: `${deliveryAddress.addressLine1}, ${deliveryAddress.city}`,
        addressLine1Snap: deliveryAddress.addressLine1,
        citySnap: deliveryAddress.city,
        provinceSnap: deliveryAddress.province,
      },
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      patientId: order.patientId,
      totalMinor: order.totalMinor,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
      createdAt: order.createdAt,
      items: orderItemsJson,
    };
  }

  async getOrders(userId: string, page = 1, limit = 20) {
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patientProfile) {
      return { data: [], total: 0, page, limit };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.pharmacyOrder.findMany({
        where: { patientId: patientProfile.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pharmacyOrder.count({
        where: { patientId: patientProfile.id },
      }),
    ]);

    return { data, total, page, limit };
  }

  async getOrderById(userId: string, orderId: string) {
    const patientProfile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    const order = await this.prisma.pharmacyOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!patientProfile || order.patientId !== patientProfile.id) {
      throw new ForbiddenException('Forbidden resource');
    }

    return order;
  }
}
