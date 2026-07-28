import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        resourceType: targetType,
        resourceId: targetId,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }
}
