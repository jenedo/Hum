import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

type CorrelatedRequest = Request & {
  correlationId: string;
};

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    (req as CorrelatedRequest).correlationId = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
