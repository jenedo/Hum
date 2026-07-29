import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

function hasProperty<K extends PropertyKey>(
  value: unknown,
  property: K,
): value is Record<K, unknown> {
  return (
    ((typeof value === 'object' && value !== null) ||
      typeof value === 'function') &&
    property in value
  );
}

type Primitive = string | number | bigint | boolean | symbol | null | undefined;

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

function hasMethod<K extends PropertyKey>(
  value: unknown,
  property: K,
): value is Record<K, (...args: unknown[]) => unknown> {
  return hasProperty(value, property) && typeof value[property] === 'function';
}

function callMethod<K extends PropertyKey>(
  value: Record<K, (...args: unknown[]) => unknown>,
  property: K,
  ...args: unknown[]
): unknown {
  return value[property](...args);
}

function stringify(value: unknown): string {
  if (isPrimitive(value)) {
    return String(value);
  }

  if (hasMethod(value, Symbol.toPrimitive)) {
    const primitiveValue = callMethod(value, Symbol.toPrimitive, 'string');
    if (isPrimitive(primitiveValue)) {
      return String(primitiveValue);
    }
    throw new TypeError('Cannot convert object to primitive value');
  }

  if (hasMethod(value, 'toString')) {
    const primitiveValue = callMethod(value, 'toString');
    if (isPrimitive(primitiveValue)) {
      return String(primitiveValue);
    }
  }

  if (hasMethod(value, 'valueOf')) {
    const primitiveValue = callMethod(value, 'valueOf');
    if (isPrimitive(primitiveValue)) {
      return String(primitiveValue);
    }
  }

  throw new TypeError('Cannot convert object to primitive value');
}

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
        exception instanceof Error ? exception.stack : stringify(exception),
      );
    } else {
      if (exception instanceof HttpException) {
        const resResponse = exception.getResponse();
        if (hasProperty(resResponse, 'message')) {
          const bodyMsg = resResponse.message;
          message = Array.isArray(bodyMsg)
            ? bodyMsg.join(', ')
            : stringify(bodyMsg);
        } else {
          message = exception.message;
        }
      } else {
        const exceptionMessage: unknown = hasProperty(exception, 'message')
          ? exception.message
          : undefined;
        message = exceptionMessage
          ? stringify(exceptionMessage)
          : 'Bad Request';
      }
      this.logger.warn(
        `Client error (${status}) on ${request.method} ${request.url}: ${message}`,
      );
    }

    const correlationId = hasProperty(request, 'correlationId')
      ? (request.correlationId ?? '')
      : '';
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
