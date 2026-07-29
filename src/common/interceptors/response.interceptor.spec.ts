import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { Request } from 'express';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

type CorrelatedRequest = Pick<Request, 'method' | 'url'> & {
  correlationId?: string;
};

interface TestData {
  id: string;
  name: string;
}

function createMockExecutionContext(
  request: CorrelatedRequest,
): ExecutionContext {
  const host = new ExecutionContextHost([request]);
  host.setType('http');
  return host;
}

function createMockCallHandler<T>(data: T): CallHandler<T> {
  return {
    handle: () => of(data),
  };
}

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<TestData>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor<TestData>();
  });

  it('should wrap successful response in standard envelope with correlationId and timestamp', (done) => {
    const request: CorrelatedRequest = {
      method: 'GET',
      url: '/api/v1/test',
      correlationId: 'test-req-id-777',
    };
    const context = createMockExecutionContext(request);
    const next = createMockCallHandler<TestData>({ id: '123', name: 'Test' });

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: { id: '123', name: 'Test' },
        correlationId: 'test-req-id-777',
        timestamp: result.timestamp,
      });
      expect(typeof result.timestamp).toBe('string');
      const date = new Date(result.timestamp);
      expect(Number.isNaN(date.getTime())).toBe(false);
      expect(date.toISOString()).toBe(result.timestamp);
      done();
    });
  });
});
