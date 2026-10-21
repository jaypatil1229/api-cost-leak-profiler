import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { CommonModule } from './common/common.module';
import { OrganizationContextGuard } from './common/guards/organization-context.guard';
import { ProjectScopeGuard } from './common/guards/project-scope.guard';
import { StrictRateLimitGuard } from './common/guards/strict-rate-limit.guard';
import { OrganizationContextGuard } from './common/guards/organization-context.guard';
import { ProjectScopeGuard } from './common/guards/project-scope.guard';
import { AppConfigModule } from './config/config.module';
import { buildLoggerParams } from './config/logger.config';
import { PrismaModule } from './database/prisma.module';
import { TokenService } from './modules/auth/token.service';
import { PasswordService } from './modules/auth/password.service';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ApiKeyVerificationService } from './modules/api-keys/api-key-verification.service';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { UsageModule } from './modules/usage/usage.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { DetectionModule } from './modules/detection/detection.module';
import { ReportsModule } from './modules/reports/reports.module';
import { APP_CONFIG } from './config/config.module';
import type { Configuration } from './config/configuration';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: Configuration) => buildLoggerParams(config),
    }),
    PrismaModule,
    CommonModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: Configuration) => [
        {
          name: 'default',
          ttl: config.rateLimit.default.ttlMs,
          limit: config.rateLimit.default.limit,
        },
      ],
    }),
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    ApiKeysModule,
    IngestionModule,
    UsageModule,
    PricingModule,
    DetectionModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    PasswordService,
    TokenService,
    ApiKeyVerificationService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: StrictRateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationContextGuard },
    { provide: APP_GUARD, useClass: ProjectScopeGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
  exports: [TokenService, PasswordService, ApiKeyVerificationService],
})
export class AppModule {}
