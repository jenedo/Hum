import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthUser,
  CurrentUser,
} from '../../security/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../supabase/supabase-auth.guard';
import { DeliveryAddressService } from './delivery-address.service';
import { CreateDeliveryAddressDto } from './dto/delivery-address.dto';

@ApiTags('pharmacy-addresses')
@ApiBearerAuth()
@Controller('pharmacy/addresses')
@UseGuards(SupabaseAuthGuard)
export class DeliveryAddressController {
  constructor(
    private readonly addressService: DeliveryAddressService,
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

  @Get()
  @ApiOperation({ summary: 'List delivery addresses for current user' })
  async getAddresses(@CurrentUser() user: AuthUser) {
    const patientId = await this.getPatientId(user.userId);
    return this.addressService.getAddresses(patientId);
  }

  @Post()
  @ApiOperation({ summary: 'Create new delivery address' })
  async createAddress(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDeliveryAddressDto,
  ) {
    const patientId = await this.getPatientId(user.userId);
    return this.addressService.createAddress(patientId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete delivery address' })
  async deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const patientId = await this.getPatientId(user.userId);
    return this.addressService.deleteAddress(patientId, id);
  }
}
