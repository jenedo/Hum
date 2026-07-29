import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type CorrelatedRequest = Partial<Request> & {
  correlationId?: string;
};

export interface ApiResponse<T> {
  success: true;
  data: T;
  correlationId: string;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T = unknown> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<CorrelatedRequest>();
    const correlationId = request?.correlationId ?? '';
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data: T): ApiResponse<T> => ({
        success: true,
        data,
        correlationId,
        timestamp,
      })),
    );
  }
}
