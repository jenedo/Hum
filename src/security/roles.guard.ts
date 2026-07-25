import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from './decorators/current-user.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      supabasePrincipal?: { supabaseUserId: string };
      user?: AuthUser;
    }>();

    const supabaseUserId = request.supabasePrincipal?.supabaseUserId;
    const userId = request.user?.userId;

    if (!supabaseUserId && !userId) {
      throw new ForbiddenException('Insufficient role');
    }

    const dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(supabaseUserId
            ? [{ supabaseAuthUserId: supabaseUserId }, { id: supabaseUserId }]
            : []),
          ...(userId ? [{ id: userId }] : []),
        ],
        isActive: true,
      },
      select: { role: true },
    });

    if (!dbUser || !requiredRoles.includes(dbUser.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
