import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerEntryType, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletQueryDto } from './dto/wallet-query.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateWallet(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.wallet.upsert({
      where: { userId },
      create: {
        userId,
        currency: 'PKR',
        balanceMinor: 0,
      },
      update: {},
    });
  }

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      id: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      balanceMinor: wallet.balanceMinor,
    };
  }

  async getLedger(userId: string, query: WalletQueryDto) {
    const wallet = await this.getOrCreateWallet(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.walletLedgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletLedgerEntry.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      balanceMinor: wallet.balanceMinor,
    };
  }

  async credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amountMinor: number,
    description: string,
    referenceType?: string,
    referenceId?: string,
  ) {
    if (amountMinor <= 0) {
      throw new BadRequestException('Credit amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(userId, tx);
    const newBalance = wallet.balanceMinor + amountMinor;

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: newBalance },
    });

    await tx.walletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        type: LedgerEntryType.CREDIT,
        amountMinor,
        currency: wallet.currency,
        balanceAfter: newBalance,
        description,
        referenceType,
        referenceId,
      },
    });

    return updatedWallet;
  }

  async debit(
    tx: Prisma.TransactionClient,
    userId: string,
    amountMinor: number,
    description: string,
    referenceType?: string,
    referenceId?: string,
  ) {
    if (amountMinor <= 0) {
      throw new BadRequestException('Debit amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(userId, tx);

    if (wallet.balanceMinor < amountMinor) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const newBalance = wallet.balanceMinor - amountMinor;

    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceMinor: newBalance },
    });

    await tx.walletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        type: LedgerEntryType.DEBIT,
        amountMinor,
        currency: wallet.currency,
        balanceAfter: newBalance,
        description,
        referenceType,
        referenceId,
      },
    });

    return updatedWallet;
  }

  async getDoctorEarnings(doctorUserId: string, query: WalletQueryDto) {
    const wallet = await this.getOrCreateWallet(doctorUserId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total, totalEarnedResult, pendingPayoutResult] =
      await Promise.all([
        this.prisma.walletLedgerEntry.findMany({
          where: {
            walletId: wallet.id,
            type: LedgerEntryType.CREDIT,
            referenceType: 'APPOINTMENT_PAYMENT',
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.walletLedgerEntry.count({
          where: {
            walletId: wallet.id,
            type: LedgerEntryType.CREDIT,
            referenceType: 'APPOINTMENT_PAYMENT',
          },
        }),
        this.prisma.walletLedgerEntry.aggregate({
          where: {
            walletId: wallet.id,
            type: LedgerEntryType.CREDIT,
            referenceType: 'APPOINTMENT_PAYMENT',
          },
          _sum: { amountMinor: true },
        }),
        this.prisma.payout.aggregate({
          where: {
            doctorUserId,
            status: PayoutStatus.PENDING,
          },
          _sum: { amountMinor: true },
        }),
      ]);

    return {
      data,
      total,
      page,
      limit,
      totalEarnedMinor: totalEarnedResult._sum.amountMinor ?? 0,
      pendingPayoutMinor: pendingPayoutResult._sum.amountMinor ?? 0,
    };
  }
}
