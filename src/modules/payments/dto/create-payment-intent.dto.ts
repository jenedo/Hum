import { PaymentProvider } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsEnum(PaymentProvider)
  @IsOptional()
  provider?: PaymentProvider = PaymentProvider.SANDBOX;
}
