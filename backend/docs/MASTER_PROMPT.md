You are a senior backend architect and engineer. Your task is to implement the complete initial backend foundation for ACLP (API Cost Leak Profiler), a multi-tenant SaaS platform that helps developers and organizations monitor, attribute, analyze, and optimize expenditure from LLM API usage.

IMPORTANT WORKING INSTRUCTIONS
- First inspect the existing repository, understand its structure, conventions, and existing files. Do not overwrite or remove existing work without understanding it.
- Implement the backend in the existing backend/ directory. If it does not exist, create it.
- Do not implement the frontend.
- Do not implement the full detection algorithms or ML models yet. Build the architecture, data models, service interfaces, API routes, validation, and response contracts so features can be implemented incrementally later.
- Do not require a live PostgreSQL connection during this task. I will configure DATABASE_URL and other environment variables later. Implement the Prisma schema, migrations if they can be generated without connecting, and all database access code. Do not claim database connectivity or migrations have been tested when they have not.
- Do not invent placeholder success responses for operations that should persist data. Implement real service logic using Prisma. If the database is unavailable, return appropriate errors.
- Do not ask questions unless blocked by a genuine ambiguity. Make reasonable engineering decisions and document them.
- Keep the implementation modular, maintainable, secure, typed, and production-conscious without overengineering.
- Do not introduce microservices, Redis, queues, or additional infrastructure unless essential to the initial foundation. Keep the main backend as a modular monolith.
- Use current stable, compatible package versions and document them.

PROJECT CONTEXT
ACLP is an observational LLM API cost observability platform. Customers integrate our SDK into their applications. Their applications continue making provider calls directly to OpenAI or Google Gemini. ACLP captures usage metadata asynchronously, ingests it into our backend, calculates estimated costs, attributes spend to features/users/sessions, detects inefficient patterns, and presents findings through a dashboard.

Core architectural principles:
1. The customer application calls LLM providers directly. ACLP is not a proxy or gateway.
2. The SDK must not block customer application execution.
3. ACLP does not need or collect provider API keys.
4. The backend is the source of truth for usage, costs, alerts, and reports.
5. Deterministic detection should eventually work independently of the Python analytics service.
6. Cost values are estimates based on versioned provider pricing, not invoice-grade billing reconciliation.
7. Every customer-owned resource must be isolated by organization and, where applicable, project.
8. Human users decide whether to take remediation actions. ACLP reports evidence and recommendations; it does not automatically modify customer applications.
9. Initial provider scope is OpenAI and Google Gemini.
10. Initial product has three major parts: dashboard/reporting, SDK, and analytics.

TECH STACK
- Node.js LTS
- TypeScript
- NestJS
- PostgreSQL
- Prisma ORM
- REST APIs, versioned under /api/v1
- JWT-based authentication using secure access/refresh token design, or a well-justified secure alternative
- Argon2id or bcrypt for password hashing; prefer Argon2id if compatibility permits
- Zod or class-validator for request validation; use one consistent approach
- Swagger/OpenAPI documentation
- Pino or NestJS-compatible structured logging
- Jest for unit tests and Supertest for API tests
- ESLint and Prettier
- dotenv/configuration module with validation
- Dockerfile and a local docker-compose configuration for PostgreSQL, but do not require starting it during implementation
- Prisma migrations and seed script
- No MongoDB or Mongoose

REPOSITORY EXPECTATIONS
Create a clear modular backend structure. Adapt to existing repository conventions if they are already established. A suggested structure:

backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    main.ts
    app.module.ts
    common/
      decorators/
      guards/
      interceptors/
      filters/
      pipes/
      dto/
      utils/
      constants/
    config/
    database/
      prisma.module.ts
      prisma.service.ts
    modules/
      auth/
      users/
      organizations/
      memberships/
      invitations/
      projects/
      api-keys/
      ingestion/
      usage/
      pricing/
      attribution/
      analytics/
      detection/
      alerts/
      reports/
      health/
    docs/
    test/
  .env.example
  .gitignore
  Dockerfile
  docker-compose.yml
  package.json
  tsconfig.json
  README.md

Each module should contain appropriate controllers, services, DTOs, and tests. Avoid creating empty modules with no meaningful implementation. If a module is intentionally scaffolded for future work, document its current scope and return an explicit not-implemented response rather than fake data.

PHASE 1 — FOUNDATION AND APPLICATION CONFIGURATION
1. Initialize or configure the NestJS TypeScript backend.
2. Set up linting, formatting, scripts, environment configuration, and application bootstrap.
3. Add global request validation, exception handling, structured logging, CORS configuration, and security headers.
4. Configure a global API prefix /api/v1, with Swagger docs at a documented path.
5. Add request IDs/correlation IDs and include them in logs and error responses.
6. Configure health endpoints:
   - GET /api/v1/health/live — process liveness, no DB dependency.
   - GET /api/v1/health/ready — readiness and database connectivity status.
   The liveness endpoint must work even if PostgreSQL is unavailable.
7. Add graceful shutdown and Prisma lifecycle management.
8. Validate required environment variables at startup. Support a development mode where the app can boot without DATABASE_URL only if no database-backed route is invoked; document this behavior. Prefer clear startup diagnostics over obscure crashes.
9. Add a consistent response/error format, including validation errors and request IDs.
10. Ensure secrets are never logged.

PHASE 2 — DATABASE DESIGN WITH PRISMA
Design a normalized, multi-tenant PostgreSQL schema. Use UUID primary keys where appropriate, createdAt/updatedAt timestamps, appropriate indexes, unique constraints, foreign keys, and deletion policies.

At minimum, model the following concepts:

A. User
- id
- name
- email (unique, normalized)
- passwordHash (never returned through APIs)
- emailVerifiedAt (nullable; verification workflow can be scaffolded)
- status (active, suspended, etc.)
- createdAt, updatedAt, lastLoginAt

B. Organization
- id
- name
- slug (unique)
- owner/creator relationship
- plan/tier (initially free)
- status
- createdAt, updatedAt

C. OrganizationMembership
- userId
- organizationId
- role: OWNER, ADMIN, MEMBER, VIEWER
- membership status
- unique user/organization pair
- timestamps
- Enforce role-based authorization on organization resources.

D. OrganizationInvitation
- organizationId
- invited email
- role
- hashed invitation token (never store raw tokens)
- expiry, acceptedAt, revokedAt
- inviter user ID
- timestamps

E. Project
- organizationId
- name
- slug or stable identifier
- description
- environment (development, staging, production, or configurable)
- status
- createdAt, updatedAt
- unique constraints scoped to organization
- A project represents one customer application or integration.

F. APIKey
- organizationId and projectId
- name
- key prefix for identification
- secure hash of secret
- scopes/permissions
- lastUsedAt
- expiresAt (nullable)
- revokedAt (nullable)
- createdBy user ID
- createdAt
- Raw API keys must only be shown once at creation. Never store plaintext API keys. Use cryptographically secure random generation and a suitable hash/HMAC strategy. Support revocation and rotation. Clearly distinguish user authentication tokens from SDK ingestion keys.

G. UsageRecord
- organizationId and projectId
- provider (OPENAI, GEMINI)
- model
- external request ID (nullable)
- internal SDK event ID / idempotency key
- timestamp
- input tokens
- output tokens
- total tokens (where available)
- latency
- status/outcome
- feature name/ID (nullable)
- user identifier supplied by customer (nullable; not an ACLP login user)
- session identifier (nullable)
- prompt hash/fingerprint (nullable)
- prompt character count (nullable)
- completion character count (nullable)
- estimated input cost
- estimated output cost
- estimated total cost
- currency (default USD)
- pricing version/reference
- sanitized metadata JSON
- createdAt
- Unique constraint for idempotency within the appropriate project scope.
- Indexes for organization, project, timestamp, provider, model, feature, user/session identifiers, and common report filters.
- Do not store full prompt or completion contents by default. Make metadata handling privacy-conscious.

H. PricingVersion / ModelPricing
- provider
- model
- input rate per million tokens
- output rate per million tokens
- currency
- effectiveFrom/effectiveTo
- version
- source/reference
- timestamps
- Prevent ambiguous overlapping active pricing entries where feasible and document how pricing versions are selected.
- Do not invent authoritative current rates. Seed only clearly labeled development examples or leave pricing data unseeded until verified rates are supplied.

I. DetectionFinding
- organizationId, projectId
- detector type
- status
- severity
- title and explanation
- evidence JSON
- implicated usage record references
- estimated recoverable cost
- detectedAt
- resolvedAt (nullable)
- timestamps
- Support future deterministic and ML detectors.

J. Alert
- organizationId, projectId
- associated finding ID (nullable)
- category, severity, status
- title, message
- evidence JSON
- estimated recoverable cost
- createdAt, acknowledgedAt, resolvedAt
- optional acknowledgedBy/resolvedBy user references
- indexes for dashboard alert filtering.

K. Report / SavedReport (if appropriate)
- organizationId, projectId (nullable for org-wide)
- name
- report configuration/filter JSON
- createdBy
- timestamps
- Do not implement expensive report scheduling yet.

L. AuditLog
- organizationId (nullable for system events)
- actor user ID (nullable for API-key actions)
- action
- resource type and ID
- sanitized metadata
- timestamp
- Never log secrets or raw credentials.

M. RefreshToken/session model
- user ID
- hashed token or secure session identifier
- expiry, revokedAt, createdAt
- device/user-agent metadata where appropriate
- Ensure refresh-token rotation and revocation are supported.

N. Optional usage ingestion batch metadata if needed for reliable batch processing and deduplication.

Design relations and indexes carefully. Use Decimal for monetary values rather than floating point. Ensure Prisma serialization of Decimal values is handled explicitly in API responses. Use JSON fields only where flexibility is genuinely needed, not as a substitute for modeling core entities.

PHASE 3 — AUTHENTICATION AND USER ACCOUNT
Implement:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- POST /api/v1/auth/logout-all
- GET /api/v1/auth/me
- Password hashing and password validation
- Access-token verification
- Refresh-token rotation, hashing, revocation, and reuse detection
- Rate limiting for authentication endpoints
- Generic login errors to reduce account enumeration
- Appropriate expiration and secure token handling
- Never return password hashes or refresh tokens in ordinary user responses.
- Document that production deployment must use HTTPS and secure cookie settings if cookies are used.
- Include password reset/email verification as documented extension points if full email delivery is out of scope. Do not pretend email was sent.

PHASE 4 — ORGANIZATIONS AND MULTI-TENANCY
Implement organization workflows:
- Create organization
- List organizations current user belongs to
- Get organization details
- Update organization
- Manage members and roles
- Invite member by email
- Accept/revoke invitation
- Remove member
- Change member role
- Transfer ownership with strict validation
- Enforce owner/admin/member/viewer permissions.
- Prevent removing the last owner or leaving an organization without an owner.
- Enforce organization isolation at the service/query layer. Never trust organizationId supplied by the client without checking membership.
- Avoid insecure direct object references (IDOR).
- Ensure all organization-owned API queries are scoped to the authenticated user's authorized organization.
- Create an organization for the registering user, or provide a clear onboarding flow. Document the chosen behavior.
- Record significant membership and organization changes in audit logs.

PHASE 5 — PROJECTS AND SDK API KEYS
Implement:
- Create/list/get/update/archive projects within an organization.
- Project-scoped API key creation, listing (metadata only), revocation, and rotation.
- Show raw key exactly once at creation.
- Authenticate SDK ingestion requests using API keys, not user JWTs.
- Use key prefix to identify the key and constant-time comparison where applicable.
- Enforce project and organization scope on every SDK request.
- Support key scopes such as usage:write and usage:read if useful.
- Track lastUsedAt safely without creating excessive writes (throttle updates if needed).
- Audit key lifecycle operations.
- Document API key storage and usage best practices.

PHASE 6 — SDK INGESTION API CONTRACT
Implement a versioned ingestion API suitable for a future TypeScript SDK. The SDK is not being built in this task, but the server contract must be stable, documented, and validated.

Implement:
- POST /api/v1/ingest/usage
- POST /api/v1/ingest/usage/batch
- Authentication through project API key
- DTO validation and payload size limits
- Idempotency using SDK event IDs/idempotency keys
- Per-event validation and clear batch result reporting
- Safe handling of duplicate events
- Provider enum initially OpenAI and Gemini
- Validate token counts as nonnegative integers and timestamps/latency as valid values.
- Accept optional feature, customer user, session, and sanitized metadata.
- Never accept provider API keys.
- Do not accept arbitrary unbounded prompt/completion text.
- Ensure cost calculation is not trusted from the client. Server-side cost computation must use the pricing service when verified pricing is available. If no pricing is configured, persist the event with cost status explicitly marked as unavailable/pending rather than inventing rates.
- Make ingestion resilient and return clear per-event outcomes.
- Add tests for invalid data, missing/revoked keys, cross-project isolation, duplicates, and batch handling.

PHASE 7 — COST, USAGE, AND ATTRIBUTION APIs
Create useful REST endpoints with DTOs, authorization, pagination, filtering, and documented response shapes.

Examples:
- GET /api/v1/usage
- GET /api/v1/usage/:id
- GET /api/v1/usage/summary
- GET /api/v1/usage/timeseries
- GET /api/v1/usage/by-provider
- GET /api/v1/usage/by-model
- GET /api/v1/usage/by-feature
- GET /api/v1/usage/by-user
- GET /api/v1/usage/by-session
- GET /api/v1/costs/summary
- GET /api/v1/costs/timeseries
- GET /api/v1/costs/breakdown
- GET /api/v1/pricing
- GET /api/v1/projects/:projectId/overview

Support filters such as:
- from/to dates
- project
- provider
- model
- feature
- customer user identifier
- session
- status
- pagination and sorting

Rules:
- Scope every query by authorized organization/project.
- Validate date ranges and limit maximum query windows/page sizes.
- Use efficient database aggregation rather than loading all records into application memory.
- Return consistent units, currencies, timezone semantics, and metadata.
- Make clear that costs are estimated.
- Handle empty datasets gracefully.
- Avoid misleading percentage changes when the previous period has zero spend.
- Do not implement expensive unbounded aggregation queries.

PHASE 8 — ANALYTICS AND DETECTION API FOUNDATION
Create the detection/analytics domain and API contracts for these planned detectors:

Five deterministic detectors:
1. Duplicate prompt detection
2. Retry loop detection
3. Unbounded conversation context
4. Oversized prompt detection
5. Spend spike detection

Two advanced analytics detectors:
6. Isolation Forest anomaly detection
7. Embedding-based semantic duplicate detection

For this initial task:
- Implement detector interfaces, shared finding/evidence contracts, persistence models, status/severity enums, and orchestration boundaries.
- Implement GET /api/v1/findings and GET /api/v1/findings/:id.
- Implement GET /api/v1/alerts and alert acknowledgement/resolution endpoints.
- Implement a detector registry or service abstraction that allows each detector to be added independently.
- Add explicit TODOs/documentation for algorithm-specific implementation.
- Do not fabricate findings or claim detectors are operational when they are only scaffolded.
- The Python analytics service will be implemented separately later. Define an internal API contract for it, but do not require it to run for the Node backend to start.
- Document how the backend will call Python analytics and how results will be validated and persisted.

PHASE 9 — REPORTING
Implement report APIs:
- GET /api/v1/reports/overview
- GET /api/v1/reports/cost
- GET /api/v1/reports/usage
- GET /api/v1/reports/detections
- POST /api/v1/reports/saved
- GET /api/v1/reports/saved
- GET /api/v1/reports/saved/:id
- DELETE /api/v1/reports/saved/:id

Implement actual aggregations where data models support them. Use pagination and validated date filters. Keep CSV export as a documented extension point unless it is straightforward to implement safely. Do not implement PDF generation or scheduled report delivery yet.

PHASE 10 — SECURITY AND RELIABILITY
Implement:
- Global validation and sanitization where appropriate.
- Secure CORS allowlist from environment configuration.
- Security headers.
- Rate limiting for login and ingestion endpoints.
- Payload size limits.
- Organization and project authorization guards.
- API-key authentication guard separate from user JWT guard.
- Consistent exception mapping without leaking stack traces or database internals.
- Safe structured logging with redaction of authorization headers, cookies, API keys, passwords, tokens, and sensitive metadata.
- Audit logs for important user/admin actions.
- Pagination defaults and maximums.
- Transaction boundaries for operations that must be atomic.
- Idempotent ingestion.
- Graceful shutdown.
- Avoid storing raw prompt content by default.
- Document retention, privacy, and production deployment considerations.
- Do not claim compliance certifications or security guarantees.

PHASE 11 — TESTING
Write meaningful tests for:
- Auth registration/login/token refresh/revocation.
- Organization creation and membership authorization.
- Cross-organization access prevention.
- Project CRUD authorization.
- API-key creation/revocation/authentication.
- Ingestion DTO validation and idempotency.
- Cost calculation with known test pricing.
- Usage filters and aggregation service logic.
- Alert/finding access isolation.
- Error response format.
- Health liveness/readiness behavior.
Use unit tests with mocks where database connectivity is not available. Add integration tests that can run later with a configured test PostgreSQL database. Clearly label tests requiring DATABASE_URL. Do not claim tests passed unless actually executed.

PHASE 12 — DOCUMENTATION AND DEVELOPER EXPERIENCE
Create a comprehensive backend README documenting:
- Project purpose and architecture
- Stack and folder structure
- Environment variables with safe example placeholders
- How to install dependencies
- How to generate Prisma Client
- How to configure PostgreSQL later
- How to run migrations once DATABASE_URL is set
- How to seed development data
- How to run dev/build/lint/test
- Swagger location
- Auth flow
- Organization and project model
- API key lifecycle
- SDK ingestion contract with request/response examples
- Cost estimation assumptions
- Analytics/detection implementation status
- Error response format
- Security notes
- Known limitations and next implementation steps

Add .env.example with placeholders only, never real credentials. Include at least:
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET (if used)
ACCESS_TOKEN_TTL
REFRESH_TOKEN_TTL
CORS_ORIGINS
PORT
NODE_ENV
LOG_LEVEL
RATE_LIMIT settings
APP_URL
Any other configuration actually required by the implementation.

IMPLEMENTATION ORDER
1. Inspect repository and establish NestJS structure.
2. Set up configuration, logging, validation, errors, health, and Swagger.
3. Design Prisma schema and generate client if possible without database access.
4. Implement auth and user/session persistence.
5. Implement organizations, memberships, invitations, and RBAC.
6. Implement projects and API key lifecycle.
7. Implement ingestion contract and persistence.
8. Implement usage/cost aggregation services and APIs.
9. Implement findings, alerts, and report foundations.
10. Add tests, documentation, and local Docker configuration.
11. Run formatting, linting, type checking, unit tests, and build. Fix issues.
12. Report any checks that could not run due to missing environment variables or database.

DEFINITION OF DONE
- Backend code is organized, typed, and builds successfully.
- Prisma schema describes all required initial entities and relations.
- No live PostgreSQL connection is required to write or review the initial implementation.
- Auth, organization isolation, project management, API keys, ingestion, usage/cost APIs, findings/alerts, and reporting foundations are implemented to the scope described.
- No fake analytics results or fabricated pricing.
- Swagger documents implemented routes and DTOs.
- Security controls and tests are present.
- README explains setup and limitations.
- Final response summarizes the files/modules created, key architectural decisions, commands run, actual test/build outcomes, and next steps.
- Do not silently omit requirements. If a requirement is too large or blocked, explicitly report it with a reason and a proposed follow-up task.

Begin by inspecting the repository, then implement the backend foundation end-to-end. Do not stop after producing a plan.