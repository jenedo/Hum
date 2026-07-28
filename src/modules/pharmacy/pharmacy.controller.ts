import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Public } from '../../security/decorators/public.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { PharmacyService } from './pharmacy.service';

@ApiTags('pharmacy-medicines')
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Public()
  @Get('medicines')
  @ApiOperation({ summary: 'Get list of in-stock medicines' })
  async getMedicines(@Query('category') category?: string) {
    return this.pharmacyService.getMedicines(category);
  }

  @Public()
  @Get('medicines/:id')
  @ApiOperation({ summary: 'Get single medicine details' })
  async getMedicineById(@Param('id') id: string) {
    return this.pharmacyService.getMedicineById(id);
  }

  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  @Post('direct-orders')
  @ApiOperation({ summary: 'Create direct medicine order' })
  async createDirectOrder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ) {
    return this.pharmacyService.createOrder(user.userId, dto);
  }
}
