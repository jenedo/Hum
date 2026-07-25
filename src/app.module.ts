import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { DoctorVerificationModule } from './modules/doctor-verification/doctor-verification.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { UsersModule } from './modules/users/users.module';
import { RolesGuard } from './security/roles.guard';
import { SecurityModule } from './security/security.module';
import { SupabaseAuthGuard } from './supabase/supabase-auth.guard';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: [
            'req.headers.authorization',
            'password',
            '*.password',
            'passwordHash',
            '*.passwordHash',
            'accessToken',
            '*.accessToken',
            'refreshToken',
            '*.refreshToken',
            'DATABASE_URL',
            '*.DATABASE_URL',
            'DIRECT_URL',
            '*.DIRECT_URL',
            'REDIS_URL',
            '*.REDIS_URL',
            'SUPABASE_PUBLISHABLE_KEY',
            '*.SUPABASE_PUBLISHABLE_KEY',
            'supabasePublishableKey',
            '*.supabasePublishableKey',
          ],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV === 'production' ||
          process.env.NODE_ENV === 'test'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 20,
      },
    ]),
    DatabaseModule,
    SecurityModule,
    SupabaseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DoctorVerificationModule,
    DoctorsModule,
    AvailabilityModule,
    AppointmentsModule,
    PrescriptionsModule,
    MedicalRecordsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
