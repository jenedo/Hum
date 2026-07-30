import { ConfigService } from '@nestjs/config';
import { createSecretSupabaseClient } from './supabase.module';

describe('createSecretSupabaseClient', () => {
  const createConfigService = (secretKey?: string): ConfigService =>
    ({
      getOrThrow: (key: string) => {
        if (key === 'SUPABASE_URL') {
          return 'https://project-ref.supabase.co';
        }
        throw new Error(`Unexpected required configuration key: ${key}`);
      },
      get: (key: string) =>
        key === 'SUPABASE_SECRET_KEY' ? secretKey : undefined,
    }) as unknown as ConfigService;

  it.each([undefined, '', '   '])(
    'fails fast when SUPABASE_SECRET_KEY is %p',
    (secretKey) => {
      const configService = createConfigService(secretKey);

      expect(() => createSecretSupabaseClient(configService)).toThrow(
        'SUPABASE_SECRET_KEY is required but not configured',
      );
    },
  );

  it('creates the secret client when SUPABASE_SECRET_KEY is configured', () => {
    const configService = createConfigService('server-secret-key');

    expect(createSecretSupabaseClient(configService)).toBeDefined();
  });
});
