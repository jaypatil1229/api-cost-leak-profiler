import { Global, Module } from '@nestjs/common';

import { OrganizationContextGuard } from './guards/organization-context.guard';
import { ProjectScopeGuard } from './guards/project-scope.guard';
import { StrictRateLimitGuard } from './guards/strict-rate-limit.guard';
import { AuditService } from './services/audit.service';
import { TenantAccessService } from './services/tenant-access.service';

/**
 * Cross-cutting building blocks used by nearly every feature module: tenant
 * access checks, the audit trail writer, and the authorization guards.
 *
 * Global so that feature modules do not each have to import it; the guards are
 * still applied explicitly per route (or globally in `AppModule`), never
 * implicitly by being available in the injector.
 */
@Global()
@Module({
  providers: [
    TenantAccessService,
    AuditService,
    OrganizationContextGuard,
    ProjectScopeGuard,
    StrictRateLimitGuard,
  ],
  exports: [
    TenantAccessService,
    AuditService,
    OrganizationContextGuard,
    ProjectScopeGuard,
    StrictRateLimitGuard,
  ],
})
export class CommonModule {}
