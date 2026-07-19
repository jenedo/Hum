# AsaanCare Backend

NestJS + Prisma + PostgreSQL + Redis API for AsaanCare (Phase 1: auth).

## Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres project (pooled + direct connection strings)
- An [Upstash](https://upstash.com) Redis database (TCP connection string)

## Quick start

```bash
cp .env.example .env
# Paste your real Neon (DATABASE_URL + DIRECT_URL) and Upstash (REDIS_URL) values into .env
npx prisma migrate deploy
npm run start:dev
```

### Neon connection strings

- `DATABASE_URL` — **pooled** connection (host ends in `-pooler.<region>.aws.neon.tech`). The app runtime queries through this.
- `DIRECT_URL` — **direct**, non-pooled connection. Prisma migrations run through this to avoid pgbouncer prepared-statement issues.

Both are wired in `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- API prefix: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests |
| `npm run test:e2e` | e2e auth flow (needs DB) |
| `npm run prisma:migrate` | Create/apply migrations |

## Auth endpoints

- `POST /api/v1/auth/register` — PATIENT or DOCTOR only
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh` — rotates refresh token
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me` — JWT required
