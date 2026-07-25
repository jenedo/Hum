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
  SUPABASE_JWT_ISSUER: Joi.string()
    .uri({ scheme: ['https'] })
    .required(),
  SUPABASE_JWT_AUDIENCE: Joi.string().default('authenticated'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('30d'),
  CORS_ORIGINS: Joi.string().required(),
});
