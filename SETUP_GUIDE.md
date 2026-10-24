# ACLP Full Stack Setup Guide

## Prerequisites
- Node.js 20+ (with npm)
- PostgreSQL 16+ (or Docker)
- A Gemini API key

## Quick Start

### Option 1: With Local PostgreSQL

1. **Install PostgreSQL** if not already installed, then create database:
```bash
# Create database and user
psql -U postgres -c "CREATE USER aclp WITH PASSWORD 'aclp123';"
psql -U postgres -c "CREATE DATABASE aclp OWNER aclp;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aclp TO aclp;"
```

2. **Configure Backend** (`.env` in backend/):
```bash
DATABASE_URL=postgresql://aclp:aclp123@localhost:5432/aclp?schema=public
REQUIRE_DATABASE=true
CORS_ORIGINS=http://localhost:3001,http://localhost:4173
# Generate secrets:
JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))")
API_KEY_HMAC_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))")
```

3. **Run Database Migrations**:
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
```

4. **Start Services**:
```bash
# Terminal 1: Backend
cd backend && npm run start:dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: SDK Test App (optional)
cd sdk-test-app && npm start
```

### Option 2: With Docker PostgreSQL

```bash
# Start PostgreSQL container
docker run -d \
  --name aclp-postgres \
  -e POSTGRES_USER=aclp \
  -e POSTGRES_PASSWORD=aclp123 \
  -e POSTGRES_DB=aclp \
  -p 5432:5432 \
  postgres:16-alpine
```

Then follow steps 2-4 above.

## Ports Summary

| Component | Port | URL |
|-----------|------|-----|
| Backend API | 4000 | http://localhost:4000 |
| Backend Swagger | 4000 | http://localhost:4000/api/v1/docs |
| Frontend | 3001 | http://localhost:3001 |
| SDK Test App | 4173 | http://localhost:4173 |

## Environment Variables

### Backend (.env)
```
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/aclp?schema=public
CORS_ORIGINS=http://localhost:3001,http://localhost:4173
JWT_ACCESS_SECRET=<64-char-base64url>
JWT_REFRESH_SECRET=<64-char-base64url>
API_KEY_HMAC_SECRET=<64-char-base64url>
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

### SDK Test App (.env)
```
PORT=4173
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash
ACLP_INGEST_URL=http://localhost:4000/ingest/usage
ACLP_API_KEY=<API_KEY_WITH_USAGE_WRITE_SCOPE>
```

## Initial Setup Flow

1. Start backend and frontend
2. Open http://localhost:3001
3. Register a new user account
4. Sign in to get JWT token
5. Create an organization (via Swagger or UI)
6. Create a project
7. Generate an API key with USAGE_WRITE scope (via Swagger UI)
8. Add the API key to sdk-test-app/.env

## Troubleshooting

### "Unable to reach the ACLP backend" error

This means the NestJS backend is not running or not accessible. Check:

1. Is the backend running? Check port 4000:
   ```bash
   curl http://localhost:4000/api/v1/health/live
   ```

2. **CRITICAL**: The backend needs to be restarted to pick up CORS changes. If login fails, restart the backend with updated `CORS_ORIGINS` in `.env`:
   ```
   CORS_ORIGINS=http://localhost:3001,http://localhost:4173
   ```

3. Is the JWT token valid? Make sure you generated proper secrets in `.env`

4. If backend fails to start, check if PostgreSQL is running and accessible:
   ```bash
   psql -h localhost -U aclp -d aclp -c "SELECT 1"
   ```

### Frontend Backend Connection

The frontend was using mock data. To connect it to the backend:

1. **Create `frontend/.env.local`** (if not exists):
   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
   ```

2. **Restart the frontend** so it picks up the environment variable:
   ```bash
   cd frontend
   npm run dev
   ```

3. The frontend will now:
   - Call `/api/v1/auth/register` and `/api/v1/auth/login` for authentication
   - Fetch real user/org data via `/api/v1/auth/me`
   - Generate real API keys via `/api/v1/projects/{id}/api-keys`

### Login redirects with query params instead of posting

This indicates the React client-side JavaScript isn't properly handling the form submission. This can happen if:

1. The backend needs to be restarted for CORS changes
2. The frontend wasn't restarted after adding `.env.local`
3. Check browser console for JavaScript errors
4. Verify the API base URL is correct in `frontend/.env.local`

### Quick Test the API Directly

```bash
# Register a new user
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!","name":"Test User"}'

# Login
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

Use the returned JWT token to call protected endpoints:
```bash
curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```