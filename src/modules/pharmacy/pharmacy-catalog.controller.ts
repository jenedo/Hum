import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../../security/decorators/public.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { PharmacyCatalogService } from './pharmacy-catalog.service';

@Controller('pharmacy')
export class PharmacyCatalogController {
  constructor(private readonly catalogService: PharmacyCatalogService) {}

  @Public()
  @Get('categories')
  async getCategories() {
    return this.catalogService.getCategories();
  }

  @Public()
  @Get('products')
  async getProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.getProducts(query);
  }

  @Public()
  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.catalogService.getProductById(id);
  }

  @Roles(Role.ADMIN)
  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Roles(Role.ADMIN)
  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }
}
