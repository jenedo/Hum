import { HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should mask 500 internal errors and never expose stack traces or DB details', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const host: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/test',
          correlationId: 'test-correlation-id',
        }),
        getResponse: () => ({
          status: mockStatus,
        }),
      }),
    };

    const internalError = new Error('PrismaClientKnownRequestError: DB failure secret table details');

    filter.catch(internalError, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 500,
        message: 'An internal error occurred',
      },
      correlationId: 'test-correlation-id',
      timestamp: expect.any(String),
    });
  });

  it('should pass client-facing error messages for HTTP 4xx exceptions', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const host: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/v1/auth/login',
          correlationId: 'req-400-id',
        }),
        getResponse: () => ({
          status: mockStatus,
        }),
      }),
    };

    const badRequest = new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);

    filter.catch(badRequest, host);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 400,
        message: 'Invalid email format',
      },
      correlationId: 'req-400-id',
      timestamp: expect.any(String),
    });
  });
});
