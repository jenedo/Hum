import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DIRECT_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  SUPABASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .required(),
  SUPABASE_PUBLISHABLE_KEY: Joi.string().trim().min(1).required(),
  SUPABASE_SECRET_KEY: Joi.string().trim().optional(),
  SUPABASE_JWT_ISSUER: Joi.string()
    .uri({ scheme: ['https'] })
    .required(),
  SUPABASE_JWT_AUDIENCE: Joi.string().default('authenticated'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  CORS_ORIGINS: Joi.string().required(),
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string()
    .optional()
    .description('Firebase Admin SDK service account JSON string'),
  FCM_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(5_000),
  FCM_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  FCM_CIRCUIT_RESET_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  FCM_MAX_CONCURRENCY: Joi.number().integer().min(1).max(20).default(2),

  // Supabase Auth circuit breaker
  SUPABASE_AUTH_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(30_000)
    .default(3_000),
  SUPABASE_AUTH_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  SUPABASE_AUTH_CIRCUIT_RESET_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  SUPABASE_AUTH_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(5),

  // Supabase Storage circuit breaker
  SUPABASE_STORAGE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(60_000)
    .default(5_000),
  SUPABASE_STORAGE_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  SUPABASE_STORAGE_CIRCUIT_RESET_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  SUPABASE_STORAGE_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),

  // Payment gateway circuit breaker
  PAYMENT_GATEWAY_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(60_000)
    .default(10_000),
  PAYMENT_GATEWAY_CIRCUIT_FAILURE_THRESHOLD: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),
  PAYMENT_GATEWAY_CIRCUIT_RESET_MS: Joi.number()
    .integer()
    .min(1_000)
    .max(300_000)
    .default(60_000),
  PAYMENT_GATEWAY_MAX_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(3),

  SANDBOX_WEBHOOK_SECRET: Joi.string()
    .optional()
    .description('Sandbox payment webhook secret'),
});

