import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  genericName: string;

  @IsString()
  @IsNotEmpty()
  brandName: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsString()
  @IsNotEmpty()
  dosageForm: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsInt()
  @Min(1)
  packSize: number;

  @IsBoolean()
  prescriptionRequired: boolean;

  @IsInt()
  @Min(0)
  unitPriceMinor: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsInt()
  @Min(0)
  initialStock: number;
}
