import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LedgerEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletQueryDto } from './dto/wallet-query.dto';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: {
    wallet: {
      upsert: jest.Mock;
      update: jest.Mock;
    };
    walletLedgerEntry: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
    };
    payout: {
      aggregate: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      wallet: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      walletLedgerEntry: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      payout: {
        aggregate: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WalletService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('getOrCreateWallet creates wallet if none exists or returns existing', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 0,
    });

    const wallet = await service.getOrCreateWallet('user-1');
    expect(wallet.id).toBe('wallet-1');
    expect(prisma.wallet.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', currency: 'PKR', balanceMinor: 0 },
      update: {},
    });
  });

  it('getWallet returns balance correctly', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 50000,
    });

    const res = await service.getWallet('user-1');
    expect(res).toEqual({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 50000,
    });
  });

  it('getLedger returns paginated entries newest first', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 50000,
    });
    prisma.walletLedgerEntry.findMany.mockResolvedValue([
      { id: 'ledger-2', amountMinor: 20000, type: LedgerEntryType.CREDIT },
      { id: 'ledger-1', amountMinor: 30000, type: LedgerEntryType.CREDIT },
    ]);
    prisma.walletLedgerEntry.count.mockResolvedValue(2);

    const query: WalletQueryDto = { page: 1, limit: 20 };
    const res = await service.getLedger('user-1', query);

    expect(res.data).toHaveLength(2);
    expect(res.total).toBe(2);
    expect(res.balanceMinor).toBe(50000);
    expect(prisma.walletLedgerEntry.findMany).toHaveBeenCalledWith({
      where: { walletId: 'wallet-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('credit increases balance and creates CREDIT ledger entry with correct balanceAfter', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 10000,
    });
    prisma.wallet.update.mockResolvedValue({
      id: 'wallet-1',
      balanceMinor: 30000,
    });

    const mockTx = prisma as unknown as Prisma.TransactionClient;
    const res = await service.credit(
      mockTx,
      'user-1',
      20000,
      'Top-up',
      'TOPUP',
      'topup-123',
    );

    expect(res.balanceMinor).toBe(30000);
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balanceMinor: 30000 },
    });
    expect(prisma.walletLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        walletId: 'wallet-1',
        type: LedgerEntryType.CREDIT,
        amountMinor: 20000,
        currency: 'PKR',
        balanceAfter: 30000,
        description: 'Top-up',
        referenceType: 'TOPUP',
        referenceId: 'topup-123',
      },
    });
  });

  it('credit throws BadRequestException for non-positive amount', async () => {
    const mockTx = prisma as unknown as Prisma.TransactionClient;
    await expect(
      service.credit(mockTx, 'user-1', 0, 'Invalid'),
    ).rejects.toThrow(BadRequestException);
  });

  it('debit decreases balance and creates DEBIT ledger entry with correct balanceAfter', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 50000,
    });
    prisma.wallet.update.mockResolvedValue({
      id: 'wallet-1',
      balanceMinor: 30000,
    });

    const mockTx = prisma as unknown as Prisma.TransactionClient;
    const res = await service.debit(
      mockTx,
      'user-1',
      20000,
      'Payment',
      'ORDER_PAYMENT',
      'order-1',
    );

    expect(res.balanceMinor).toBe(30000);
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balanceMinor: 30000 },
    });
    expect(prisma.walletLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        walletId: 'wallet-1',
        type: LedgerEntryType.DEBIT,
        amountMinor: 20000,
        currency: 'PKR',
        balanceAfter: 30000,
        description: 'Payment',
        referenceType: 'ORDER_PAYMENT',
        referenceId: 'order-1',
      },
    });
  });

  it('debit throws BadRequestException when balance is insufficient', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      currency: 'PKR',
      balanceMinor: 10000,
    });

    const mockTx = prisma as unknown as Prisma.TransactionClient;
    await expect(
      service.debit(mockTx, 'user-1', 20000, 'Payment'),
    ).rejects.toThrow(BadRequestException);
  });

  it('getDoctorEarnings returns only CREDIT entries for doctor', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-doc-1',
      userId: 'doc-user-1',
      currency: 'PKR',
      balanceMinor: 100000,
    });
    prisma.walletLedgerEntry.findMany.mockResolvedValue([
      { id: 'ledger-doc-1', amountMinor: 50000, type: LedgerEntryType.CREDIT },
    ]);
    prisma.walletLedgerEntry.count.mockResolvedValue(1);
    prisma.walletLedgerEntry.aggregate.mockResolvedValue({
      _sum: { amountMinor: 50000 },
    });
    prisma.payout.aggregate.mockResolvedValue({
      _sum: { amountMinor: 10000 },
    });

    const query: WalletQueryDto = { page: 1, limit: 20 };
    const res = await service.getDoctorEarnings('doc-user-1', query);

    expect(res.totalEarnedMinor).toBe(50000);
    expect(res.pendingPayoutMinor).toBe(10000);
    expect(prisma.walletLedgerEntry.findMany).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet-doc-1',
        type: LedgerEntryType.CREDIT,
        referenceType: 'APPOINTMENT_PAYMENT',
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});
