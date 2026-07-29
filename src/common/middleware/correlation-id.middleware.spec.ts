import type { NextFunction, Request, Response } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

type MockRequest = Pick<Request, 'headers'> & {
  correlationId?: string;
};

type MockResponse = Pick<Response, 'setHeader'>;

function createMockResponse(): {
  mockSetHeader: jest.Mock<Response, [string, string]>;
  res: Response;
} {
  const mockSetHeader = jest.fn<Response, [string, string]>();
  const resObject: MockResponse = {
    setHeader: mockSetHeader,
  };
  mockSetHeader.mockReturnValue(resObject as Response);
  const res = resObject as Response;
  return { mockSetHeader, res };
}

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should generate a correlationId if x-request-id header is missing', () => {
    const reqObject: MockRequest = { headers: {} };
    const req = reqObject as Request;
    const { mockSetHeader, res } = createMockResponse();
    const next: jest.Mock<void, []> = jest.fn<void, []>();
    const nextFunction = next as NextFunction;

    middleware.use(req, res, nextFunction);

    expect(reqObject.correlationId).toBeDefined();
    expect(typeof reqObject.correlationId).toBe('string');
    expect(mockSetHeader).toHaveBeenCalledWith(
      'x-request-id',
      reqObject.correlationId,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should reuse existing x-request-id header if provided', () => {
    const customId = 'custom-request-id-12345';
    const reqObject: MockRequest = { headers: { 'x-request-id': customId } };
    const req = reqObject as Request;
    const { mockSetHeader, res } = createMockResponse();
    const next: jest.Mock<void, []> = jest.fn<void, []>();
    const nextFunction = next as NextFunction;

    middleware.use(req, res, nextFunction);

    expect(reqObject.correlationId).toBe(customId);
    expect(mockSetHeader).toHaveBeenCalledWith('x-request-id', customId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
