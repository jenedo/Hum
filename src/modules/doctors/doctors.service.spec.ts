import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DoctorsService } from './doctors.service';

type MockPrisma = {
  doctorProfile: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('DoctorsService', () => {
  let service: DoctorsService;
  let mockPrisma: MockPrisma;

  const sampleDoctor = {
    id: 'doc-1',
    fullName: 'Dr. Ali Raza',
    specialty: 'Cardiologist',
    pmdcNumber: '12345-P',
    isVerified: true,
    user: { email: 'ali@example.com' },
  };

  beforeEach(() => {
    mockPrisma = {
      doctorProfile: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    service = new DoctorsService(mockPrisma as unknown as PrismaService);
  });

  it('lists verified doctors', async () => {
    mockPrisma.doctorProfile.findMany.mockResolvedValue([sampleDoctor]);

    const result = await service.listVerified();
    expect(result).toEqual([sampleDoctor]);
    expect(mockPrisma.doctorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isVerified: true },
      }),
    );
  });

  it('filters verified doctors by specialty', async () => {
    mockPrisma.doctorProfile.findMany.mockResolvedValue([sampleDoctor]);

    await service.listVerified('Cardiologist');
    expect(mockPrisma.doctorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isVerified: true,
          specialty: { equals: 'Cardiologist', mode: 'insensitive' },
        },
      }),
    );
  });

  it('returns verified doctor by ID', async () => {
    mockPrisma.doctorProfile.findFirst.mockResolvedValue(sampleDoctor);

    const result = await service.getVerifiedById('doc-1');
    expect(result).toEqual(sampleDoctor);
  });

  it('throws 404 if doctor is not found or not verified', async () => {
    mockPrisma.doctorProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.getVerifiedById('unverified-doc'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
