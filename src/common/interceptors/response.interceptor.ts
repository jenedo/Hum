import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const correlationId = (request as any)?.correlationId ?? '';
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data ?? null,
        correlationId,
        timestamp,
      })),
    );
  }
}
