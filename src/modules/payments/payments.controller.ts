import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Public } from '../../security/decorators/public.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Roles(Role.PATIENT, Role.DOCTOR)
  @Post('intent')
  @ApiOperation({ summary: 'Create a payment intent for an order' })
  async createIntent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(user.userId, dto);
  }

  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get payment status by ID' })
  async getStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(user.userId, id);
  }

  @Public()
  @Post('webhook/sandbox')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process sandbox payment webhook' })
  async handleSandboxWebhook(
    @Req() req: { rawBody?: string | Buffer; body?: any },
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    return this.paymentsService.handleWebhook(rawBody, headers);
  }
}
