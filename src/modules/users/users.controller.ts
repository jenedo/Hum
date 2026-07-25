import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../security/decorators/current-user.decorator';
import { CurrentUser } from '../../security/decorators/current-user.decorator';
import type { SupabasePrincipal } from '../../supabase/supabase-principal';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
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
