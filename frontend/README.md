# ACLP frontend

Next.js dashboard and marketing site for the ACLP backend.

## Local development

Use Node.js 22 or newer. Start PostgreSQL and the NestJS backend first, then configure backend CORS to allow `http://localhost:3001` (for example, `CORS_ORIGINS=http://localhost:3001`). The NestJS backend runs on port 4000 by default and the frontend dev server uses port 3001.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

The frontend API base URL is `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:4000/api/v1`. Set it to the deployed NestJS API URL for another environment. This value is public configuration, never a credential.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

The test launcher applies a Windows-only TSX temporary-directory fallback for locked-down runtimes where `os.userInfo()` is unavailable. It does not change the test assertions.

Playwright smoke tests need Chromium installed and a production build:

```powershell
npx playwright install chromium
npm run build
npm run test:e2e
```

## API and session behavior

The dashboard calls authenticated NestJS routes under `/api/v1` and unwraps the backend's `{ success, data, meta }` response envelope. Errors remain errors; they are not converted to empty data. The API client sends short-lived access tokens as bearer credentials and rotates the refresh token through `/auth/refresh` after a 401. Access tokens are kept in memory; the rotating refresh token is held in `sessionStorage` for the current browser tab and cleared on sign-out or failed refresh. This follows the existing backend token-body contract; the backend does not currently issue an HTTP-only refresh cookie.

`/auth/me` supplies organizations and memberships. Organization and project selection is session-scoped and every data request is still authorized and tenant-scoped by the backend. Logout clears the session and the protected dashboard redirects to sign-in after session expiry.

Password reset, invitation management, API key management, budget/pricing settings, and saved report actions are not connected because the corresponding user flows are not implemented by the backend. The marketing product demonstration remains an explicitly illustrative sample. Dashboard routes use API data and show loading, empty, or error states.

## Alert ordering and browser notifications

The Alerts page defaults to most recently updated first. The API applies the selected sort and status/severity filters before pagination, with timestamp and alert ID tie-breakers for stable page boundaries. List preferences are represented in the page URL so reloads retain the selected filters.

Browser notifications are opt-in and use the browser Notification API while the authenticated ACLP dashboard is open. Permission is requested only after selecting **Enable notifications** on the Alerts page. Severity/status preferences are stored in local storage scoped to the signed-in user, organization, and project. Existing alerts are treated as the initial snapshot; repeated polls and refreshes of an existing alert do not produce another notification. Notifications are not delivered while the page is closed or the browser is not running.

True background Web Push is not implemented. It would require HTTPS service-worker registration, VAPID public/private keys held by the server, authenticated subscription create/revoke endpoints and tenant/user-scoped subscription storage, plus a server-side delivery worker with expired-subscription handling. No VAPID values or push credentials are configured by the current browser-notification implementation.
