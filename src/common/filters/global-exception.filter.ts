import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string;
    if (status >= 500) {
      message = 'An internal error occurred';
      this.logger.error(
        `Internal error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      if (exception instanceof HttpException) {
        const resResponse = exception.getResponse();
        if (
          typeof resResponse === 'object' &&
          resResponse !== null &&
          'message' in resResponse
        ) {
          const bodyMsg = (resResponse as Record<string, any>).message;
          message = Array.isArray(bodyMsg)
            ? bodyMsg.join(', ')
            : String(bodyMsg);
        } else {
          message = exception.message;
        }
      } else {
        message = (exception as any)?.message
          ? String((exception as any).message)
          : 'Bad Request';
      }
      this.logger.warn(
        `Client error (${status}) on ${request.method} ${request.url}: ${message}`,
      );
    }

    const correlationId = (request as any)?.correlationId ?? '';
    const timestamp = new Date().toISOString();

    response.status(status).json({
      success: false,
      error: {
        code: status,
        message,
      },
      correlationId,
      timestamp,
    });
  }
}
