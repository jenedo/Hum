import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthApiError, JwtHeader, JwtPayload } from '@supabase/supabase-js';
import { SupabaseClaimsVerifier } from './supabase-claims.verifier';
import type { SupabaseServerClient } from './supabase.constants';

type GetClaims = SupabaseServerClient['auth']['getClaims'];

const issuer = 'https://project-ref.supabase.co/auth/v1';
const audience = 'authenticated';
const accessToken = 'header.payload.signature';

describe('SupabaseClaimsVerifier', () => {
  let getClaims: jest.MockedFunction<GetClaims>;
  let verifier: SupabaseClaimsVerifier;

  const validClaims = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
    iss: issuer,
    sub: 'supabase-user-id',
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'session-id',
    email: 'patient@example.com',
    phone: '+923001234567',
    ...overrides,
  });

  const verifiedResult = (
    claims: JwtPayload,
    alg: JwtHeader['alg'],
  ): Awaited<ReturnType<GetClaims>> => ({
    data: {
      claims,
      header: {
        alg,
        kid: 'signing-key-id',
        typ: 'JWT',
      },
      signature: new Uint8Array([1, 2, 3]),
    },
    error: null,
  });

  beforeEach(() => {
    getClaims = jest.fn() as jest.MockedFunction<GetClaims>;
    const supabase = {
      auth: { getClaims },
    } as unknown as SupabaseServerClient;
    const configService = new ConfigService({
      SUPABASE_JWT_ISSUER: issuer,
      SUPABASE_JWT_AUDIENCE: audience,
    });

    verifier = new SupabaseClaimsVerifier(supabase, configService);
  });

  it('accepts valid ES256 claims', async () => {
    getClaims.mockResolvedValue(verifiedResult(validClaims(), 'ES256'));

    await expect(verifier.verifyAccessToken(accessToken)).resolves.toEqual({
      supabaseUserId: 'supabase-user-id',
      sessionId: 'session-id',
      email: 'patient@example.com',
      phone: '+923001234567',
      aal: 'aal1',
    });
  });

  it('accepts valid transitional HS256 claims with an audience array', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(validClaims({ aud: ['other', audience] }), 'HS256'),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).resolves.toMatchObject({
      supabaseUserId: 'supabase-user-id',
      sessionId: 'session-id',
    });
  });

  it('rejects blank access tokens without calling Supabase', async () => {
    await expect(verifier.verifyAccessToken('   ')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getClaims).not.toHaveBeenCalled();
  });

  it('rejects Supabase verification errors without exposing details', async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: new AuthApiError('internal verification detail', 401, 'bad_jwt'),
    });

    await expect(verifier.verifyAccessToken(accessToken)).rejects.toMatchObject(
      {
        message: 'Invalid access token',
      },
    );
  });

  it('rejects a missing subject', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(validClaims({ sub: undefined }), 'ES256'),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect issuer', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(
        validClaims({ iss: 'https://wrong-project.supabase.co/auth/v1' }),
        'ES256',
      ),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect audience', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(validClaims({ aud: ['other'] }), 'ES256'),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired claims', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 1 }),
        'ES256',
      ),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a missing session id', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(validClaims({ session_id: undefined }), 'ES256'),
    );

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects the none algorithm', async () => {
    getClaims.mockResolvedValue(verifiedResult(validClaims(), 'none'));

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects another unsupported algorithm', async () => {
    getClaims.mockResolvedValue(verifiedResult(validClaims(), 'RS256'));

    await expect(
      verifier.verifyAccessToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not copy the Supabase role into the principal', async () => {
    getClaims.mockResolvedValue(
      verifiedResult(validClaims({ role: 'service_role' }), 'ES256'),
    );

    const principal = await verifier.verifyAccessToken(accessToken);

    expect(principal).not.toHaveProperty('role');
    expect(principal).toEqual(
      expect.objectContaining({
        supabaseUserId: 'supabase-user-id',
        sessionId: 'session-id',
      }),
    );
  });
});
