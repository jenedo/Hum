import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { IS_PUBLIC_KEY } from '../security/decorators/public.decorator';
import { SupabaseClaimsVerifier } from './supabase-claims.verifier';
import type { SupabaseAuthenticatedRequest } from './supabase-principal';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly claimsVerifier: SupabaseClaimsVerifier,
    @Optional() private readonly reflector?: Reflector,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) {
        return true;
      }
    }

    const request = context
      .switchToHttp()
      .getRequest<SupabaseAuthenticatedRequest & { user?: any }>();

    const token = this.extractBearerToken(request.headers.authorization);
    const principal = await this.claimsVerifier.verifyAccessToken(token);

    request.supabasePrincipal = principal;

    if (this.prisma) {
      const dbUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { supabaseAuthUserId: principal.supabaseUserId },
            { id: principal.supabaseUserId },
          ],
          isActive: true,
        },
        select: { id: true, role: true },
      });

      if (dbUser) {
        request.user = {
          userId: dbUser.id,
          role: dbUser.role,
        };
      }
    }

    return true;
  }

  private extractBearerToken(header: unknown): string {
    if (typeof header !== 'string') {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    const match = /^Bearer ([^\s]+)$/.exec(header);
    if (!match) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }

    return match[1];
  }
}
