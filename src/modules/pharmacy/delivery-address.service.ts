import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateDeliveryAddressDto } from './dto/delivery-address.dto';

@Injectable()
export class DeliveryAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async getAddresses(patientId: string) {
    return this.prisma.deliveryAddress.findMany({
      where: {
        patientId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(patientId: string, dto: CreateDeliveryAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.deliveryAddress.updateMany({
          where: {
            patientId,
            deletedAt: null,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.deliveryAddress.create({
        data: {
          patientId,
          label: dto.label,
          recipientName: dto.recipientName,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          province: dto.province,
          postalCode: dto.postalCode,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async deleteAddress(patientId: string, addressId: string) {
    const address = await this.prisma.deliveryAddress.findFirst({
      where: {
        id: addressId,
        patientId,
        deletedAt: null,
      },
    });

    if (!address) {
      throw new NotFoundException('Delivery address not found');
    }

    await this.prisma.deliveryAddress.update({
      where: { id: addressId },
      data: { deletedAt: new Date() },
    });
  }
}
