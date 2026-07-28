import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MedicineOrderItemDto {
  @IsString()
  @IsNotEmpty()
  medicineId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicineOrderItemDto)
  items?: MedicineOrderItemDto[];
}
