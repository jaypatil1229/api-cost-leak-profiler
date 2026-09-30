# ACLP — Frontend

Initial frontend for **ACLP (API Cost Leak Profiler)**: a story-driven marketing site plus a working
product dashboard that runs entirely on deterministic sample data. There is no backend, no API
client, and no environment configuration in this phase.

Brand idea: **Make every AI dollar make sense.**
Promise: *See where your AI spend goes. Understand why. Know what to fix.*

## Run it

Requires Node 22 or newer.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run dev        # development server (Turbopack)
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint, zero warnings allowed
npm run typecheck  # tsc --noEmit
npm test           # sample-data invariant tests (node:test via tsx)
npm run test:e2e   # Playwright smoke tests over every route (needs a build first)
```

No environment variables are needed. Nothing in this app calls out to a network service.

The browser tests are optional and need a one-time browser download before their first run:

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

They start the production server on port 3312, walk every route at desktop and mobile widths,
fail on any console error, check that the dashboard shell navigates, and scan the marketing
homepage with axe.

## What is in here

**Marketing site** (`/`) — a single narrative page: hero, the blind spot, hidden cost patterns, the
product reveal, an interactive sample demonstration, signal → explanation → action, trust and
implementation notes, and a closing call to action. Supporting pages: `/product`,
`/how-it-works`, `/docs`, `/privacy`, `/terms`, `/contact`.

**Dashboard** — `/overview`, `/attribution`, `/trends`, `/usage`, `/findings`, `/findings/[id]`,
`/alerts`, `/reports`, `/project-settings`, `/organization-settings`. Persistent shell with a
collapsible sidebar, project selector, date-range control, notifications, and a user menu.

**Auth and onboarding** — `/sign-in`, `/sign-up`, `/forgot-password`, `/onboarding` (organization →
project → SDK setup). All flows are simulated and say so on screen.

## Sample data

The dashboard reads from one deterministic ledger:

- `src/lib/mock-data/ledger.ts` — a seeded generator that builds roughly 64,000 requests across 90
  days ending 2026-09-30. Six seeded scenario windows (spend spike, context growth, retry loop,
  duplicate burst, oversized context, model escalation) create the patterns the product explains.
- `src/lib/mock-data/` — catalog, projects, organization, and alert fixtures.
- `src/lib/mock-services/repository.ts` — the only data surface pages consume. Every metric,
  trend, attribution row, finding, and list goes through it, so a real API client can replace this
  layer without touching the UI.
- `src/lib/mock-services/repository.test.ts` — asserts the data is internally consistent: spend
  reconciles with the ledger, input + output equals total tokens, every attribution dimension sums
  to the same total, pagination does not overlap, and each finding links to records that exist.

Numbers are believable rather than round, and the seed makes them identical on every run.

## Design system

- Warm neutral canvas (`#F7F7F4`), ink `#182333`, accent `#315D9B`; semantic success, warning,
  and danger tokens. Dark mode uses a warm blue-black base.
- Type: **Newsreader** for display, **Onest** for interface, **IBM Plex Mono** for data and
  identifiers, all loaded through Fontsource.
- Motion: opacity and transform only, one shared easing curve
  (`cubic-bezier(0.22, 1, 0.36, 1)`), timings from 100 ms micro-interactions to 650 ms section
  reveals. `prefers-reduced-motion` collapses durations globally.

## Structure

```text
src/
  app/
    (marketing)/      public site and its narrative pages
    (auth)/           sign in, sign up, password reset, onboarding
    (dashboard)/      authenticated shell and every product route
    globals.css       tokens, base styles, reduced-motion rules
  components/
    ui/               shadcn/ui primitives
    shared/           metric, status, filter, drawer, page-header, theme, copy
    charts/           Recharts wrappers (trend, ranked bars, mix, sparkline)
    marketing/        narrative sections and the interactive demo
    dashboard/        shell, providers, and one view per route
    tables/           shared sortable header
    auth/             auth shell, forms, onboarding wizard
  lib/
    mock-data/        deterministic fixtures and the ledger generator
    mock-services/    repository, metrics, query helpers, demo scenario
    formatters/       currency, token, date, latency formatting
  types/domain/       UsageRecord, CostSummary, LeakFinding, Alert, Project, Organization…
  hooks/              URL state, project selection, hydration
```

## Prototype boundaries

Everything below is deliberate and stated in the interface itself:

- Authentication, invitations, and onboarding do not create accounts or send email.
- Alert acknowledge/resolve, settings edits, and member changes update local state only. Project
  settings persist to `localStorage` for this browser.
- Pricing rates are sample values, and any cost derived from them is labelled an estimate.
- Findings separate **observed** measurements, **estimated** impact, and **suggested** next steps,
  and no recommendation is applied automatically.
- Prompt and completion content is never collected or displayed. Request details say "Not
  collected".
