# ACLP frontend implementation direction

The source brief is `DESIGN-aclp.md`. The reference analyses inform narrative pacing, interface hierarchy, and product demonstrations; their branding is not copied.

## Visual decisions

- Canvas `#F7F7F4`, white surfaces `#FFFFFF`, ink `#182333`, muted blue `#315D9B`, secondary text `#606C79`, structural border `#E0E4E5`.
- Newsreader Variable for editorial headings, Onest Variable for the interface, IBM Plex Mono for technical identifiers and tabular data. All three are distributed under the SIL Open Font License through Fontsource. Font packages are bundled locally; no remote font request or build-time font download is needed. Onest is the brief's practical open-source interface alternative.
- Four-pixel spacing rhythm; controls use 6–8px radii, content panels 10–14px, and the main demonstration 18px. Elevation is reserved for overlays.
- Shared semantic tokens define complete light and dark themes. The dashboard exposes a workspace theme preference.
- Motion uses Motion for React, transform/opacity, a shared `[0.22, 1, 0.36, 1]` easing, short feedback, and reduced-motion support. No autonomous looping motion.

## Composition considered

Option A: a centered headline above an entire dashboard. Rejected because it makes the software too small to explain the product, and the brief explicitly excludes this composition.

Option B (selected): an asymmetric editorial opening with a legible cost investigation alongside the narrative. The data path, from cost to feature to request evidence, is the visual signature.

```text
ACLP       Product / How it works / Docs          Sign in / Get started

Your AI bill is only        Spend signal / selected spike
telling half the story.    └ feature → model → request evidence
Supporting explanation    A compact, usable product illustration
Explore / Get started

Provider bill → application-level attribution
Hidden cost mechanisms / focused editorial examples
Application → SDK telemetry → ACLP → analytics → investigation
Interactive investigation with replay and request evidence
Detect → understand → investigate / implementation questions
Final invitation / useful footer destinations
```

The dashboard uses a quieter sans-serif hierarchy, open metric strips, grounded charts, and compact tables. All numbers derive from one deterministic request ledger. Filters and drill-downs share the same repository contract. Finding evidence always refers to actual sample records.

## Prototype boundaries

All telemetry is sample data, anchored to September 2026. Authentication, invitations, settings, alert actions, and onboarding are local simulations. No provider calls, API client, real credentials, email, account creation, billing connection, or backend persistence. Prompt and completion text are excluded. SDK instructions identify proposed sample configuration until an SDK package is released.

## Verification approach

Production build, strict TypeScript, ESLint, repository invariant tests, and browser interaction checks cover the marketing story, full investigation flow, every dashboard route, filtering, state changes, validation, CSV export, responsive layout, themes, and reduced motion. Browser evidence is written under ignored `test-results/`.

## Final verification

Run from `frontend/` on the completed implementation:

- `npm run typecheck` — passes with strict TypeScript and no `any` in application code.
- `npm run lint` — passes with `--max-warnings=0`; `react-hooks/incompatible-library` is disabled
  because react-hook-form is not React-Compiler analyzable, which only skips compilation.
- `npm test` — 14 assertions pass over the ledger: spend reconciles with the records, input plus
  output equals total tokens, every attribution dimension sums to the same total and to 100% share,
  pagination does not overlap, filters and sorting hold, and every finding links to real records.
- `npm run build` — compiles 21 routes (11 static, 10 dynamic) with no errors.
- `npm run test:e2e` — 48 Playwright checks pass at desktop and mobile widths: every route responds
  without console errors, the dashboard shell navigates, and the marketing homepage reports no axe
  violations for WCAG 2.0/2.1 A and AA.
