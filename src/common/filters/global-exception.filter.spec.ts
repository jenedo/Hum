import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { Request } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';

interface ErrorResponseBody {
  success: boolean;
  error: {
    code: number;
    message: string;
  };
  correlationId: string;
  timestamp: string;
}

type FilterRequest = Pick<Request, 'method' | 'url'> & {
  correlationId?: string;
};

interface MockResponseChain {
  status: jest.Mock<MockResponseChain, [number]>;
  json: jest.Mock<MockResponseChain, [ErrorResponseBody]>;
}

function createMockResponse(): {
  mockStatus: jest.Mock<MockResponseChain, [number]>;
  mockJson: jest.Mock<MockResponseChain, [ErrorResponseBody]>;
  mockResponseChain: MockResponseChain;
} {
  const mockStatus = jest.fn<MockResponseChain, [number]>();
  const mockJson = jest.fn<MockResponseChain, [ErrorResponseBody]>();

  const mockResponseChain: MockResponseChain = {
    status: mockStatus,
    json: mockJson,
  };

  mockStatus.mockReturnValue(mockResponseChain);
  mockJson.mockReturnValue(mockResponseChain);

  return { mockStatus, mockJson, mockResponseChain };
}

function createMockArgumentsHost(
  request: FilterRequest,
  mockResponse: MockResponseChain,
): ArgumentsHost {
  const host = new ExecutionContextHost([request, mockResponse]);
  host.setType('http');
  return host;
}

function assertResponseEnvelope(
  payload: ErrorResponseBody,
  expectedCode: number,
  expectedMessage: string,
  expectedCorrelationId: string,
): void {
  expect(payload).toEqual({
    success: false,
    error: {
      code: expectedCode,
      message: expectedMessage,
    },
    correlationId: expectedCorrelationId,
    timestamp: payload.timestamp,
  });

  expect(typeof payload.timestamp).toBe('string');
  const date = new Date(payload.timestamp);
  expect(Number.isNaN(date.getTime())).toBe(false);
  expect(date.toISOString()).toBe(payload.timestamp);
  expect(payload).not.toHaveProperty('stack');
  expect(payload.error).not.toHaveProperty('stack');
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should mask 500 internal errors and never expose stack traces or DB details', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/test',
      correlationId: 'test-correlation-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const internalError = new Error(
      'PrismaClientKnownRequestError: DB failure secret table details',
    );

    filter.catch(internalError, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      500,
      'An internal error occurred',
      'test-correlation-id',
    );
    expect(JSON.stringify(payload)).not.toContain(
      'PrismaClientKnownRequestError',
    );
    expect(JSON.stringify(payload)).not.toContain('secret table details');
    expect(payload).not.toHaveProperty('stack');
    expect(payload.error).not.toHaveProperty('stack');
  });

  it('should pass client-facing error messages for HTTP 4xx exceptions', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'POST',
      url: '/api/v1/auth/login',
      correlationId: 'req-400-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const badRequest = new HttpException(
      'Invalid email format',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(badRequest, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(payload, 400, 'Invalid email format', 'req-400-id');
  });

  it('should join array validation messages correctly', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'POST',
      url: '/api/v1/auth/register',
      correlationId: 'req-array-msg-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const validationException = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(validationException, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      400,
      'email must be an email, password is too short',
      'req-array-msg-id',
    );
  });

  it('should return empty correlationId when correlationId is absent from request', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/health',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const internalError = new Error('Database connection lost');

    filter.catch(internalError, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(payload, 500, 'An internal error occurred', '');
  });

  it('should return correct status and message for a direct string HttpException', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/resource',
      correlationId: 'direct-string-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException(
      'Unauthorized access',
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      401,
      'Unauthorized access',
      'direct-string-id',
    );
  });

  it('should return string message from an HttpException response object', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/resource',
      correlationId: 'obj-msg-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Access forbidden for current role',
        error: 'Forbidden',
      },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockJson).toHaveBeenCalledTimes(1);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      403,
      'Access forbidden for current role',
      'obj-msg-id',
    );
  });

  it('should join array message from an HttpException response object with ", "', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'PUT',
      url: '/api/v1/profile',
      correlationId: 'array-join-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['name is required', 'age must be positive'],
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      400,
      'name is required, age must be positive',
      'array-join-id',
    );
  });

  it('should mask a normal Error as a 500 response', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/data',
      correlationId: 'normal-error-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const standardError = new Error('Unexpected runtime exception');

    filter.catch(standardError, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      500,
      'An internal error occurred',
      'normal-error-id',
    );
  });

  it('should mask a non-Error unknown value (such as a string) as a 500 response', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'POST',
      url: '/api/v1/action',
      correlationId: 'string-exception-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const stringException = 'Raw string error thrown';

    filter.catch(stringException, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    const payload = mockJson.mock.calls[0][0];
    assertResponseEnvelope(
      payload,
      500,
      'An internal error occurred',
      'string-exception-id',
    );
  });

  it('should ensure internal error details and stack are absent from the response object', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/secure',
      correlationId: 'no-stack-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const errorWithStack = new Error('Sensitive stack trace information');
    errorWithStack.stack = 'Error: Sensitive stack trace at file.ts:10:5';

    filter.catch(errorWithStack, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    const payload = mockJson.mock.calls[0][0];
    expect(payload).not.toHaveProperty('stack');
    expect(payload.error).not.toHaveProperty('stack');
    expect(JSON.stringify(payload)).not.toContain('Sensitive stack trace');
  });

  it('should return correlationId when present in request', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/ping',
      correlationId: 'present-corr-id-12345',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

    const payload = mockJson.mock.calls[0][0];
    expect(payload.correlationId).toBe('present-corr-id-12345');
  });

  it('should return empty string when correlationId is absent from request', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/ping',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

    const payload = mockJson.mock.calls[0][0];
    expect(payload.correlationId).toBe('');
  });

  it('should produce a valid ISO-8601 timestamp in response payload', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/time',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException('Time Check', HttpStatus.OK);

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.OK);

    const payload = mockJson.mock.calls[0][0];
    expect(typeof payload.timestamp).toBe('string');
    const date = new Date(payload.timestamp);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.toISOString()).toBe(payload.timestamp);
  });

  it('should ensure status(code) returns the chain used by .json(payload)', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'GET',
      url: '/api/v1/chain-test',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException('Chain check', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockStatus.mock.results[0].value).toBe(mockResponseChain);
    expect(mockJson).toHaveBeenCalledTimes(1);
  });

  it('should keep the exact response envelope structure unchanged', () => {
    const { mockStatus, mockJson, mockResponseChain } = createMockResponse();
    const request: FilterRequest = {
      method: 'POST',
      url: '/api/v1/envelope',
      correlationId: 'envelope-corr-id',
    };
    const host = createMockArgumentsHost(request, mockResponseChain);

    const exception = new HttpException(
      'Envelope check',
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    const payload = mockJson.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      ['correlationId', 'error', 'success', 'timestamp'].sort(),
    );
    expect(Object.keys(payload.error).sort()).toEqual(
      ['code', 'message'].sort(),
    );
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe(400);
    expect(payload.error.message).toBe('Envelope check');
    expect(payload.correlationId).toBe('envelope-corr-id');
  });
});
