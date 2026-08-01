import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import { Roles } from '../../security/decorators/roles.decorator';
import { RolesGuard } from '../../security/roles.guard';
import type { SupabasePrincipal } from '../../supabase/supabase-principal';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  getMe(
    @Req() req: { supabasePrincipal?: SupabasePrincipal; user?: AuthUser },
    @CurrentUser() user?: AuthUser,
  ) {
    const identifier =
      user?.userId || req.user?.userId || req.supabasePrincipal?.supabaseUserId;
    if (!identifier) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.usersService.getMe(identifier);
  }
}
