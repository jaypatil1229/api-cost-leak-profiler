-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProjectEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('USAGE_WRITE', 'USAGE_READ');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('OPENAI', 'GEMINI');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('SUCCESS', 'ERROR', 'TIMEOUT', 'RATE_LIMITED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CostStatus" AS ENUM ('CALCULATED', 'PENDING_PRICING', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DetectorType" AS ENUM ('DUPLICATE_PROMPT', 'RETRY_LOOP', 'UNBOUNDED_CONTEXT', 'OVERSIZED_PROMPT', 'SPEND_SPIKE', 'ANOMALY_ISOLATION_FOREST', 'SEMANTIC_DUPLICATE');

-- CreateEnum
CREATE TYPE "DetectorKind" AS ENUM ('DETERMINISTIC', 'ADVANCED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('COST_LEAK', 'SPEND_SPIKE', 'ANOMALY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DetectionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DetectionEngine" AS ENUM ('NODE', 'PYTHON');

-- CreateEnum
CREATE TYPE "IngestionBatchStatus" AS ENUM ('ACCEPTED', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('OVERVIEW', 'COST', 'USAGE', 'DETECTIONS');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'API_KEY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "VerificationTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" VARCHAR(64),
    "replacedById" UUID,
    "userAgent" VARCHAR(512),
    "ipAddress" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "VerificationTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "plan" "OrganizationPlan" NOT NULL DEFAULT 'FREE',
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" UUID,
    "acceptedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "description" VARCHAR(1000),
    "environment" "ProjectEnvironment" NOT NULL DEFAULT 'DEVELOPMENT',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "keyPrefix" VARCHAR(64) NOT NULL,
    "keyHash" VARCHAR(128) NOT NULL,
    "scopes" "ApiKeyScope"[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "rotatedFromKeyId" UUID,
    "createdByUserId" UUID,
    "revokedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "inputRatePerMillionTokens" DECIMAL(20,10) NOT NULL,
    "outputRatePerMillionTokens" DECIMAL(20,10) NOT NULL,
    "cachedInputRatePerMillionTokens" DECIMAL(20,10),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "version" VARCHAR(64) NOT NULL,
    "source" VARCHAR(512),
    "notes" VARCHAR(1000),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "apiKeyId" UUID,
    "clientBatchId" VARCHAR(128),
    "eventCount" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "IngestionBatchStatus" NOT NULL DEFAULT 'ACCEPTED',
    "sdkName" VARCHAR(64),
    "sdkVersion" VARCHAR(32),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "eventId" VARCHAR(128) NOT NULL,
    "externalRequestId" VARCHAR(128),
    "provider" "Provider" NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER,
    "latencyMs" INTEGER,
    "status" "CallStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorCode" VARCHAR(64),
    "featureId" VARCHAR(128),
    "customerUserId" VARCHAR(128),
    "sessionId" VARCHAR(128),
    "promptHash" VARCHAR(128),
    "promptCharCount" INTEGER,
    "completionCharCount" INTEGER,
    "estimatedInputCost" DECIMAL(20,10),
    "estimatedOutputCost" DECIMAL(20,10),
    "estimatedTotalCost" DECIMAL(20,10),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "costStatus" "CostStatus" NOT NULL DEFAULT 'PENDING_PRICING',
    "modelPricingId" UUID,
    "pricingVersion" VARCHAR(64),
    "metadata" JSONB,
    "sdkName" VARCHAR(64),
    "sdkVersion" VARCHAR(32),
    "apiKeyId" UUID,
    "ingestionBatchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionRun" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "detectorType" "DetectorType" NOT NULL,
    "detectorVersion" VARCHAR(32) NOT NULL,
    "engine" "DetectionEngine" NOT NULL DEFAULT 'NODE',
    "status" "DetectionRunStatus" NOT NULL DEFAULT 'PENDING',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "recordsScanned" INTEGER NOT NULL DEFAULT 0,
    "findingsCreated" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(2000),
    "triggeredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectionFinding" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "detectorType" "DetectorType" NOT NULL,
    "detectorVersion" VARCHAR(32) NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "title" VARCHAR(200) NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "estimatedRecoverableCost" DECIMAL(20,10),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "fingerprint" VARCHAR(128) NOT NULL,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "detectionRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectionFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingUsageLink" (
    "id" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "usageRecordId" UUID NOT NULL,
    "role" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingUsageLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "findingId" UUID,
    "category" "AlertCategory" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB,
    "estimatedRecoverableCost" DECIMAL(20,10),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "type" "ReportType" NOT NULL,
    "config" JSONB NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
    "actorUserId" UUID,
    "actorApiKeyId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(64),
    "metadata" JSONB,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "requestId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_idx" ON "RefreshToken"("userId", "familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_idx" ON "VerificationToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_role_idx" ON "OrganizationMembership"("organizationId", "role");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_userId_organizationId_key" ON "OrganizationMembership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_email_status_idx" ON "OrganizationInvitation"("email", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_expiresAt_idx" ON "OrganizationInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_projectId_revokedAt_idx" ON "ApiKey"("projectId", "revokedAt");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "ModelPricing_provider_model_effectiveFrom_idx" ON "ModelPricing"("provider", "model", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ModelPricing_effectiveFrom_effectiveTo_idx" ON "ModelPricing"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricing_provider_model_version_key" ON "ModelPricing"("provider", "model", "version");

-- CreateIndex
CREATE INDEX "IngestionBatch_projectId_receivedAt_idx" ON "IngestionBatch"("projectId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionBatch_projectId_clientBatchId_key" ON "IngestionBatch"("projectId", "clientBatchId");

-- CreateIndex
CREATE INDEX "UsageRecord_organizationId_occurredAt_idx" ON "UsageRecord"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_occurredAt_idx" ON "UsageRecord"("projectId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_provider_occurredAt_idx" ON "UsageRecord"("projectId", "provider", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_model_occurredAt_idx" ON "UsageRecord"("projectId", "model", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_featureId_occurredAt_idx" ON "UsageRecord"("projectId", "featureId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_customerUserId_occurredAt_idx" ON "UsageRecord"("projectId", "customerUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_sessionId_occurredAt_idx" ON "UsageRecord"("projectId", "sessionId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_promptHash_occurredAt_idx" ON "UsageRecord"("projectId", "promptHash", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_status_occurredAt_idx" ON "UsageRecord"("projectId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_costStatus_idx" ON "UsageRecord"("projectId", "costStatus");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_projectId_eventId_key" ON "UsageRecord"("projectId", "eventId");

-- CreateIndex
CREATE INDEX "DetectionRun_projectId_detectorType_createdAt_idx" ON "DetectionRun"("projectId", "detectorType", "createdAt");

-- CreateIndex
CREATE INDEX "DetectionRun_organizationId_status_idx" ON "DetectionRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DetectionFinding_organizationId_status_severity_idx" ON "DetectionFinding"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "DetectionFinding_projectId_detectedAt_idx" ON "DetectionFinding"("projectId", "detectedAt");

-- CreateIndex
CREATE INDEX "DetectionFinding_projectId_detectorType_status_idx" ON "DetectionFinding"("projectId", "detectorType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DetectionFinding_projectId_detectorType_fingerprint_key" ON "DetectionFinding"("projectId", "detectorType", "fingerprint");

-- CreateIndex
CREATE INDEX "FindingUsageLink_usageRecordId_idx" ON "FindingUsageLink"("usageRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "FindingUsageLink_findingId_usageRecordId_key" ON "FindingUsageLink"("findingId", "usageRecordId");

-- CreateIndex
CREATE INDEX "Alert_organizationId_status_createdAt_idx" ON "Alert"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_organizationId_severity_status_idx" ON "Alert"("organizationId", "severity", "status");

-- CreateIndex
CREATE INDEX "Alert_projectId_status_createdAt_idx" ON "Alert"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_findingId_idx" ON "Alert"("findingId");

-- CreateIndex
CREATE INDEX "SavedReport_organizationId_type_idx" ON "SavedReport"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SavedReport_organizationId_name_key" ON "SavedReport"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_modelPricingId_fkey" FOREIGN KEY ("modelPricingId") REFERENCES "ModelPricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_ingestionBatchId_fkey" FOREIGN KEY ("ingestionBatchId") REFERENCES "IngestionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionRun" ADD CONSTRAINT "DetectionRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionRun" ADD CONSTRAINT "DetectionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionRun" ADD CONSTRAINT "DetectionRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionFinding" ADD CONSTRAINT "DetectionFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionFinding" ADD CONSTRAINT "DetectionFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionFinding" ADD CONSTRAINT "DetectionFinding_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionFinding" ADD CONSTRAINT "DetectionFinding_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectionFinding" ADD CONSTRAINT "DetectionFinding_detectionRunId_fkey" FOREIGN KEY ("detectionRunId") REFERENCES "DetectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingUsageLink" ADD CONSTRAINT "FindingUsageLink_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "DetectionFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingUsageLink" ADD CONSTRAINT "FindingUsageLink_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "UsageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "DetectionFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

