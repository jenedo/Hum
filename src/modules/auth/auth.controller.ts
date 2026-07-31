import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../security/decorators/current-user.decorator';
import type {
  SupabaseAuthenticatedRequest,
  SupabasePrincipal,
} from '../../supabase/supabase-principal';
import { AuthService } from './auth.service';
import { BootstrapDto } from './dto/bootstrap.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user identity' })
  getMe(
    @CurrentUser() user: AuthUser | undefined,
    @Req() request: SupabaseAuthenticatedRequest,
  ) {
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return {
      userId: user.userId,
      email: request.supabasePrincipal?.email,
      role: user.role,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete client-side logout' })
  logout(): void {}

  @HttpCode(HttpStatus.OK)
  @Post('bootstrap')
  @ApiOperation({
    summary: 'Bootstrap or link a Supabase authenticated user profile',
  })
  bootstrap(
    @Req() req: { supabasePrincipal: SupabasePrincipal },
    @Body() dto: BootstrapDto,
  ) {
    return this.authService.bootstrap(req.supabasePrincipal, dto);
  }
}
