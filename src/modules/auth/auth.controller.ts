import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupabasePrincipal } from '../../supabase/supabase-principal';
import { AuthService } from './auth.service';
import { BootstrapDto } from './dto/bootstrap.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
