import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  CurrentUser,
} from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto';
import { PharmacyCartService } from './pharmacy-cart.service';

@ApiTags('pharmacy-cart')
@ApiBearerAuth()
@Controller('pharmacy/cart')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PharmacyCartController {
  constructor(
    private readonly cartService: PharmacyCartService,
    private readonly prisma: PrismaService,
  ) {}

  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }
    return patient.id;
  }

  @Roles(Role.PATIENT)
  @Get()
  @ApiOperation({ summary: 'Get current user pharmacy cart with totals' })
  async getCart(@CurrentUser() user: AuthUser) {
    const patientId = await this.getPatientId(user.userId);
    return this.cartService.getCartWithTotals(patientId);
  }

  @Roles(Role.PATIENT)
  @Post('items')
  @ApiOperation({ summary: 'Add item to pharmacy cart' })
  async addItem(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    const patientId = await this.getPatientId(user.userId);
    return this.cartService.addItem(patientId, dto);
  }

  @Roles(Role.PATIENT)
  @Patch('items/:productId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const patientId = await this.getPatientId(user.userId);
    return this.cartService.updateItem(patientId, productId, dto);
  }

  @Roles(Role.PATIENT)
  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeItem(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    const patientId = await this.getPatientId(user.userId);
    return this.cartService.removeItem(patientId, productId);
  }
}
