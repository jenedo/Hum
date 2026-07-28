import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('should wrap successful response in standard envelope with correlationId and timestamp', (done) => {
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          correlationId: 'test-req-id-777',
        }),
      }),
    };

    const next: any = {
      handle: () => of({ id: '123', name: 'Test' }),
    };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual({
        success: true,
        data: { id: '123', name: 'Test' },
        correlationId: 'test-req-id-777',
        timestamp: expect.any(String),
      });
      done();
    });
  });
});
