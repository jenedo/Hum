import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Public } from '../../security/decorators/public.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';

@ApiTags('availability')
@Controller('doctors')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @ApiBearerAuth()
  @Roles(Role.DOCTOR)
  @Post('availability')
  @ApiOperation({
    summary: 'Create availability for the authenticated doctor (JWT-resolved)',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.createForCurrentDoctor(user.userId, dto);
  }

  @Public()
  @Get(':id/availability')
  @ApiOperation({
    summary: 'List active availability for a verified doctor (public)',
  })
  listPublic(@Param('id') doctorProfileId: string) {
    return this.availabilityService.listPublic(doctorProfileId);
  }
}
