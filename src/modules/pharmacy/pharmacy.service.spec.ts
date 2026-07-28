import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyService', () => {
  let service: PharmacyService;
  let prisma: {
    medicine: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    patientProfile: {
      findUnique: jest.Mock;
    };
    pharmacyOrder: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    deliveryAddress: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      medicine: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      patientProfile: {
        findUnique: jest.fn(),
      },
      pharmacyOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      deliveryAddress: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PharmacyService>(PharmacyService);
  });

  it('getMedicines returns in-stock medicines, filtered by category when provided', async () => {
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Panadol', category: 'Painkiller', inStock: true },
    ]);

    const result = await service.getMedicines('Painkiller');
    expect(result).toHaveLength(1);
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: { inStock: true, category: 'Painkiller' },
      orderBy: { name: 'asc' },
    });
  });

  it('getMedicineById returns medicine or throws 404 if missing or out of stock', async () => {
    prisma.medicine.findUnique.mockResolvedValue(null);
    await expect(service.getMedicineById('missing-id')).rejects.toThrow(
      NotFoundException,
    );

    prisma.medicine.findUnique.mockResolvedValue({
      id: 'med-out',
      inStock: false,
    });
    await expect(service.getMedicineById('med-out')).rejects.toThrow(
      NotFoundException,
    );

    prisma.medicine.findUnique.mockResolvedValue({
      id: 'med-1',
      name: 'Panadol',
      inStock: true,
    });
    const med = await service.getMedicineById('med-1');
    expect(med.name).toBe('Panadol');
  });

  it('createOrder calculates totalMinor strictly from DB pricePkr * 100 * quantity', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      fullName: 'John Doe',
    });
    prisma.pharmacyOrder.findUnique.mockResolvedValue(null);
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Panadol', pricePkr: 50, inStock: true },
      { id: 'med-2', name: 'Brufen', pricePkr: 120, inStock: true },
    ]);
    prisma.deliveryAddress.findFirst.mockResolvedValue({
      id: 'addr-1',
      recipientName: 'John Doe',
      phone: '+923000000000',
      addressLine1: 'Street 1',
      city: 'Lahore',
      province: 'Punjab',
    });
    prisma.pharmacyOrder.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'ord-new-1',
          createdAt: new Date(),
          ...args.data,
        }),
    );

    const dto: CreateOrderDto = {
      idempotencyKey: 'idemp-med-1',
      items: [
        { medicineId: 'med-1', quantity: 2 }, // 50 * 100 * 2 = 10000 minor
        { medicineId: 'med-2', quantity: 1 }, // 120 * 100 * 1 = 12000 minor
      ],
    };

    const res = await service.createOrder('user-1', dto);
    // totalMinor = 10000 + 12000 = 22000 minor
    expect(res.totalMinor).toBe(22000);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].lineTotalMinor).toBe(10000);
    expect(res.items[1].lineTotalMinor).toBe(12000);
  });

  it('createOrder rejects request if any medicine is missing or out of stock', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
    });
    prisma.pharmacyOrder.findUnique.mockResolvedValue(null);
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', pricePkr: 50, inStock: false },
    ]);

    const dto: CreateOrderDto = {
      idempotencyKey: 'idemp-2',
      items: [{ medicineId: 'med-1', quantity: 1 }],
    };

    await expect(service.createOrder('user-1', dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('createOrder ignores any client-supplied price and uses DB price strictly', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      fullName: 'John',
    });
    prisma.pharmacyOrder.findUnique.mockResolvedValue(null);
    // DB price is 50 PKR (5000 minor per item)
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Panadol', pricePkr: 50, inStock: true },
    ]);
    prisma.deliveryAddress.findFirst.mockResolvedValue({
      id: 'addr-1',
      recipientName: 'John',
      phone: '123',
      addressLine1: 'Addr 1',
      city: 'City',
      province: 'Prov',
    });
    prisma.pharmacyOrder.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'ord-1', createdAt: new Date(), ...args.data }),
    );

    const dto: CreateOrderDto = {
      idempotencyKey: 'idemp-price-test',
      items: [{ medicineId: 'med-1', quantity: 3 }],
    };

    const res = await service.createOrder('user-1', dto);
    // 50 * 100 * 3 = 15000 minor units
    expect(res.totalMinor).toBe(15000);
  });

  it('getOrderById enforces patient ownership', async () => {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'pat-owner',
      userId: 'user-owner',
    });
    prisma.pharmacyOrder.findUnique.mockResolvedValue({
      id: 'ord-123',
      patientId: 'pat-other',
    });

    await expect(service.getOrderById('user-owner', 'ord-123')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
