import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';

@ApiTags('doctors')
@ApiBearerAuth()
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all verified doctors with optional specialty filter',
  })
  @ApiQuery({ name: 'specialty', required: false, type: String })
  getDoctors(@Query('specialty') specialty?: string) {
    return this.doctorsService.listVerified(specialty);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a verified doctor profile by ID' })
  getDoctorById(@Param('id') id: string) {
    return this.doctorsService.getVerifiedById(id);
  }
}
