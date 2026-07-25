import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { SupabaseClaimsVerifier } from './supabase-claims.verifier';
import { SupabasePrincipal } from './supabase-principal';

type GuardRequest = {
  headers: {
    authorization?: string;
  };
  supabasePrincipal?: SupabasePrincipal;
};

describe('SupabaseAuthGuard', () => {
  let verifier: jest.Mocked<Pick<SupabaseClaimsVerifier, 'verifyAccessToken'>>;
  let guard: SupabaseAuthGuard;

  const principal: SupabasePrincipal = {
    supabaseUserId: 'supabase-user-id',
    sessionId: 'session-id',
    email: 'patient@example.com',
  };

  const contextFor = (request: GuardRequest): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    verifier = {
      verifyAccessToken: jest.fn(),
    };
    guard = new SupabaseAuthGuard(
      verifier as unknown as SupabaseClaimsVerifier,
    );
  });

  it('rejects a missing Authorization header', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects the wrong authentication scheme', async () => {
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Basic credentials' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer token', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer ' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('propagates verifier rejection without attaching a principal', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer rejected-token' },
    };
    verifier.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException('Invalid access token'),
    );

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.supabasePrincipal).toBeUndefined();
  });

  it('attaches a verified principal to the dedicated request field', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer verified-token' },
    };
    verifier.verifyAccessToken.mockResolvedValue(principal);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.supabasePrincipal).toEqual(principal);
  });

  it('passes only the extracted bearer token to the verifier', async () => {
    const request: GuardRequest = {
      headers: { authorization: 'Bearer extracted-token' },
    };
    verifier.verifyAccessToken.mockResolvedValue(principal);

    await guard.canActivate(contextFor(request));

    expect(verifier.verifyAccessToken).toHaveBeenCalledTimes(1);
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith('extracted-token');
  });
});
