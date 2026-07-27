import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  CurrentUser,
} from '../../security/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { PharmacyOrderService } from './pharmacy-order.service';

@ApiTags('pharmacy-orders')
@ApiBearerAuth()
@Controller('pharmacy/orders')
@UseGuards(SupabaseAuthGuard)
export class PharmacyOrderController {
  constructor(
    private readonly orderService: PharmacyOrderService,
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

  @Post()
  @ApiOperation({ summary: 'Create pharmacy order from cart (checkout)' })
  async createOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ) {
    const patientId = await this.getPatientId(user.userId);
    return this.orderService.createOrder(user.userId, patientId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List user pharmacy orders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOrders(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const patientId = await this.getPatientId(user.userId);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.orderService.getOrders(patientId, pageNum, limitNum);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pharmacy order details by ID' })
  async getOrderById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const patientId = await this.getPatientId(user.userId);
    return this.orderService.getOrderById(patientId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel pharmacy order' })
  async cancelOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const patientId = await this.getPatientId(user.userId);
    return this.orderService.cancelOrder(user.userId, patientId, id);
  }
}
