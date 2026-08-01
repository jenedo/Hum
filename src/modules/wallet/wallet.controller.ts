import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { WalletQueryDto } from './dto/wallet-query.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get current user wallet snapshot' })
  async getWallet(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.userId);
  }

  @Get('transactions')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get paginated wallet transactions' })
  async getTransactions(
    @CurrentUser() user: AuthUser,
    @Query() query: WalletQueryDto,
  ) {
    return this.walletService.getLedger(user.userId, query);
  }

  @Get('earnings')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Get doctor earnings summary' })
  async getEarnings(
    @CurrentUser() user: AuthUser,
    @Query() query: WalletQueryDto,
  ) {
    return this.walletService.getDoctorEarnings(user.userId, query);
  }
}
