import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should generate a correlationId if x-request-id header is missing', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe('string');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.correlationId);
    expect(next).toHaveBeenCalled();
  });

  it('should reuse existing x-request-id header if provided', () => {
    const customId = 'custom-request-id-12345';
    const req: any = { headers: { 'x-request-id': customId } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBe(customId);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', customId);
    expect(next).toHaveBeenCalled();
  });
});
