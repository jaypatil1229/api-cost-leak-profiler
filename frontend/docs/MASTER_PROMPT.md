# ACLP — Frontend Master Prompt

## Initial Frontend Implementation | Marketing Website + Product Dashboard

You are a senior frontend engineer, product designer, and motion designer working on **ACLP (API Cost Leak Profiler)**.

Your task is to build the initial frontend of ACLP from scratch. This is an early implementation, not the final production release. The objective is to establish a strong visual identity, a complete navigable user experience, a compelling marketing website, and a convincing product dashboard using realistic dummy data.

Do not spend time integrating the backend or building real API connections yet. The backend is being developed separately. Build the frontend so that API integration can be added later without rewriting the UI.

You are expected to make thoughtful design decisions independently. Do not stop at a basic scaffold, a collection of static cards, or a generic dashboard template.

---

# 1. Product Understanding

ACLP is a SaaS platform that helps teams understand, monitor, and optimize the costs of LLM API usage inside their applications.

Teams often know how much they spend on AI APIs, but they do not know:

* Which product features are responsible for the spending.
* Which users, sessions, or workflows consume the most tokens.
* Why costs suddenly increase.
* Whether retries, duplicate prompts, or oversized contexts are wasting money.
* Which models are being used and whether they are appropriate for the workload.
* Where optimization opportunities exist.
* Whether an increase in spending represents real product growth or inefficient application behavior.

ACLP connects API usage to application behavior and turns raw telemetry into explanations that teams can act on.

**Core brand idea: Make every AI dollar make sense.**

Supporting message:

"See where your AI spend goes. Understand why. Know what to fix."

The product should feel like a combination of:

* Technical observability.
* Financial clarity.
* Developer tooling.
* Thoughtful product analytics.
* An approachable, well-crafted SaaS experience.

The experience should communicate trust, precision, clarity, and intelligence without feeling cold or overly enterprise-heavy.

---

# 2. Primary Objective

Build two connected experiences:

1. **A story-driven public marketing website** that explains the problem, demonstrates the product, and encourages visitors to explore or sign up.
2. **An authenticated product dashboard** that demonstrates the value of ACLP through realistic, interactive analytics and workflows.

The marketing website is not just a hero section followed by feature cards. It should have a deliberate narrative and visual rhythm.

The dashboard is not just a set of charts. It should demonstrate how a user moves from a high-level cost signal to a specific explanation and then to a possible action.

Every major section should answer a question a potential customer might have.

---

# 3. Technical Stack

Use the following stack unless the existing repository already has a compatible setup that should be preserved.

* Next.js with App Router.
* TypeScript with strict typing.
* Tailwind CSS.
* shadcn/ui for foundational accessible components, customized to ACLP's design system.
* Lucide icons.
* Recharts for data visualizations.
* Framer Motion (Motion for React) for carefully controlled animation.
* TanStack Query may be installed and prepared for future data fetching, but do not build real API integration now.
* React Hook Form and Zod for forms and validation.
* date-fns for date formatting and date manipulation.
* Zustand only if shared client state genuinely requires it.

Use the latest stable compatible versions.

Keep components modular and reusable. Avoid creating one enormous page component.

Use Server Components by default where possible. Introduce Client Components only when interaction, animation, or browser-side state requires them.

Ensure the application runs locally and all routes compile.

---

# 4. Design Direction — Non-Negotiable

## Overall aesthetic

The design should feel:

* Editorial rather than template-driven.
* Premium but not luxurious for its own sake.
* Technical but approachable.
* Spacious and intentional.
* Quietly confident.
* Modern without chasing short-lived visual trends.

**North star: Clarity is the aesthetic.**

The visual experience should come from excellent typography, composition, hierarchy, spacing, and meaningful interaction—not decorative effects.

## Inspiration

Use the following products as references for specific qualities, not as templates to copy:

* **Stripe:** clear narrative, strong product education, thoughtful section transitions.
* **Linear:** polished interface hierarchy, precision, and restrained interaction.
* **Apple:** smooth, subtle, tactile motion and excellent pacing.
* **Vercel:** typographic discipline and clean technical presentation.
* **Raycast:** product-first storytelling and functional demonstrations.
* **PostHog:** distinctive voice and willingness to be memorable.
* **Langfuse:** developer-focused technical clarity.

Do not copy their layouts, branding, color schemes, illustrations, or signature elements.

## Strictly avoid

* Generic AI landing-page templates.
* Purple-blue neon gradients.
* Glowing blobs and floating decorative spheres.
* Excessive glassmorphism.
* Unnecessary 3D elements.
* Random floating UI cards that do not explain the product.
* Excessive rounded cards and pill-shaped everything.
* Emoji used as icons.
* Oversized generic headings without a meaningful story.
* Excessive shadows.
* Constant animation.
* Generic stock photography.
* Fake customer logos, testimonials, awards, or performance claims.
* Charts with arbitrary data presented as real customer findings.

The website should be eye-catching through composition and typography, not visual noise.

---

# 5. Typography

Typography is a major part of ACLP's identity. Do not default to a generic font pairing simply because it is convenient.

Explore the following font directions:

### Preferred editorial direction

* Display: Tiempos Headline or Newsreader.
* Interface: Söhne or General Sans.
* Technical labels and numbers: Berkeley Mono or IBM Plex Mono.

### Alternative contemporary direction

* Display: Cabinet Grotesk or Clash Display.
* Interface: PP Neue Montreal or Onest.
* Technical labels and numbers: Berkeley Mono or IBM Plex Mono.

Use available, legally usable fonts. Confirm licensing before self-hosting commercial font files. If a preferred font is unavailable, select the closest practical alternative rather than silently substituting a generic system font.

Do not load every font candidate. Select a coherent pairing and implement it consistently.

Typography should establish three distinct voices:

1. Expressive display typography for marketing storytelling.
2. Highly readable sans-serif typography for interface content.
3. Monospaced typography for technical data, tokens, IDs, model names, and numerical details.

Use typography with intention:

* Large display headings should have controlled line lengths.
* Body copy should remain comfortable to read.
* Numbers should align consistently.
* Technical labels should be restrained and legible.
* Avoid excessive font-weight changes within one section.

If practical, create a small typography comparison on the hero before committing to a direction.

---

# 6. Color System

Start with a restrained warm-neutral foundation.

Suggested initial tokens:

* Canvas: `#F7F7F4`
* Surface: `#FFFFFF`
* Primary text: `#182333`
* Secondary text: `#4C5868`
* Muted text: `#788391`
* Border: `#E5E7E7`
* Accent: `#315D9B`
* Accent soft: `#E8EEF7`
* Success: `#267A59`
* Warning: `#B7791F`
* Danger: `#C44949`
* Informational: `#4779B8`

These are starting values, not immutable requirements. Adjust them when testing real components.

Use color semantically:

* Green means healthy, recovered, or saved.
* Amber means caution or attention.
* Red means error, abnormality, or risk.
* Blue means informational or interactive.

Do not rely on color alone to convey status. Include labels, icons, or other visual cues.

Use a warm blue-black foundation for dark mode rather than pure black. Dark mode should be implemented consistently if included in the initial scope; do not create a superficial toggle that leaves components visually broken.

Avoid decorative gradients. If a gradient is used at all, it must serve a clear functional or compositional purpose.

---

# 7. Motion and Animation System

Motion is a core part of the experience, but it must remain subtle.

The target is **smooth, quiet, Apple-like motion**, not loud animation or a motion-heavy portfolio website.

Animations should make the interface feel responsive, tactile, and connected.

## Motion principles

* Prefer opacity and transform animations.
* Use spring motion only when it feels natural and restrained.
* Avoid layout shifts.
* Avoid animating large areas unnecessarily.
* Do not delay access to content for the sake of an entrance animation.
* Keep motion consistent across the entire application.
* Respect `prefers-reduced-motion`.
* Ensure animations do not interfere with keyboard navigation or screen readers.

## Suggested timing

* Micro-interactions: 100–160ms.
* Button and hover transitions: 160–240ms.
* Panel transitions: 240–360ms.
* Section reveals: 360–650ms.
* Hero and demo sequences: 500–800ms when justified.

Suggested easing:

`cubic-bezier(0.22, 1, 0.36, 1)`

Use a consistent motion system rather than inventing a new transition for every component.

## Marketing animations

* Gentle hero text entrance.
* Subtle movement in the hero product visualization.
* Smooth section reveals as content enters the viewport.
* Controlled chart drawing or data transitions.
* Soft transitions between demo states.
* Small, responsive hover feedback.
* Gentle sticky or pinned storytelling only if it improves comprehension.

## Dashboard animations

* Smooth chart updates when changing date ranges.
* Subtle tab and filter transitions.
* Drawers and dialogs that feel connected to their triggers.
* Gentle row or status changes.
* Small hover feedback on interactive data points.
* Loading skeletons that do not flash or cause layout shifts.

## Do not implement

* Infinite floating animations.
* Aggressive parallax.
* Scroll hijacking.
* Excessive staggered text animation.
* Bounce-heavy motion.
* Large animated backgrounds.
* Animations that prevent users from interacting with the page.
* Animations that exist only to make a screenshot look impressive.

---

# 8. Marketing Website — Story-Driven Experience

Create a complete, responsive public homepage.

The narrative should move through this sequence:

**Problem → Curiosity → Hidden cause → Product reveal → Proof → Action.**

The page should make visitors understand why ACLP exists before presenting a long list of features.

## Section 1 — Hero

Core headline direction:

"Your AI bill is only telling half the story."

Alternative headline:

"Make every AI dollar make sense."

Supporting copy:

"ACLP connects your LLM API spend to the features, users, and requests behind it—so you can understand what is driving costs and where to improve."

Primary CTA: "Explore the product"

Secondary CTA: "Get started"

The hero must be visually distinctive and immediately communicate the product's value.

Do not use a generic centered headline with a floating dashboard screenshot underneath.

Explore an editorial composition:

* Strong typographic hierarchy.
* Deliberate asymmetry.
* A meaningful product visualization.
* A clear visual relationship between spend, usage, and application behavior.
* Restrained motion that reveals the product rather than distracting from it.

The hero visualization could show a cost signal becoming connected to a feature, model, and request-level explanation.

It must be legible and useful, not merely decorative.

## Section 2 — The blind spot

Headline direction:

"You know what you spent. But do you know why?"

Explain the gap between provider billing dashboards and application-level cost intelligence.

Show the difference between:

* A provider bill showing aggregate spend.
* ACLP showing the feature, user, model, and request responsible for that spend.

Use a visual comparison or interactive transition rather than a generic feature grid.

## Section 3 — The hidden cost story

Headline direction:

"The expensive part isn't always the obvious part."

Introduce real-world cost patterns:

* Retry loops.
* Duplicate requests.
* Oversized context.
* Unnecessary model escalation.
* Expensive feature workflows.
* Sudden usage spikes.

Present these as understandable examples, not fear-based marketing.

Use an editorial layout with a few focused examples. Each example should explain the mechanism and its impact.

## Section 4 — Product reveal

Headline direction:

"Meet the layer that connects every request to its cost."

Introduce ACLP as the observability layer between an application and its understanding of LLM usage.

Show the relationship between:

Application → SDK telemetry → ACLP → Analytics → Actionable insight.

Explain that the initial SDK supports OpenAI and Google Gemini, while avoiding claims about capabilities that have not been implemented.

Make clear that ACLP observes application telemetry and does not need to intercept or replace the application's provider API calls.

Do not imply that full prompts or completions are collected by default. Explain that telemetry can be designed to minimize sensitive content.

## Section 5 — Interactive product demonstration

This is one of the most important sections of the entire site.

Do not substitute a static dashboard screenshot.

Build a polished, interactive demonstration that lets visitors experience the product.

### Suggested demo flow

1. Start with a spend trend chart containing a noticeable cost spike.
2. Allow the visitor to select the spike.
3. Transition to a feature attribution view.
4. Show which feature or workflow contributed to the increase.
5. Allow the visitor to inspect example requests.
6. Reveal a finding, its supporting evidence, and a suggested next step.

Example narrative:

* A team's AI spend increases sharply.
* The spike is associated with a document summarization feature.
* A subset of requests has unusually large input token counts.
* The example records reveal repeated context or inefficient request behavior.
* ACLP explains the pattern and presents an actionable investigation path.

All demonstration data must be clearly labeled as **sample data**.

The visitor should be able to replay or reset the demonstration.

Use accessible controls and ensure the demo works on mobile. On narrow screens, convert complex side-by-side layouts into a clear sequential experience.

Do not claim that a simulated optimization has produced real savings.

## Section 6 — From signal to explanation to action

Headline direction:

"From signal to explanation to action."

Show three connected stages:

1. Detect: identify a spike, anomaly, or waste pattern.
2. Understand: connect it to a feature, user, model, session, or request.
3. Investigate: inspect evidence and determine the next step.

Use a cohesive visual flow rather than three generic cards.

## Section 7 — Trust and implementation

Answer practical questions:

* How does telemetry reach ACLP?
* Which providers are supported initially?
* What information is collected?
* Can sensitive prompt content be excluded?
* How are costs calculated or estimated?
* What happens when data is delayed or unavailable?

Do not invent security certifications, compliance claims, uptime guarantees, or customer adoption statistics.

If a detail is not yet implemented, describe it as planned or omit it rather than presenting it as an existing capability.

## Section 8 — Final CTA

Headline direction:

"See what your AI spend is really doing."

Supporting copy should reinforce visibility and understanding.

CTA: "Get started"

Use a visually memorable ending that feels like a natural conclusion to the story.

## Header and footer

Header:

* ACLP wordmark.
* Product.
* How it works.
* Documentation (placeholder link if not implemented).
* Sign in.
* Get started.

The header should be restrained, responsive, and easy to navigate.

Footer:

* Product links.
* Documentation.
* Privacy.
* Terms.
* Contact.
* Copyright.

For links that are not implemented, use honest placeholder destinations or a clear "Coming soon" state. Do not create dead links.

---

# 9. Product Dashboard

Build a convincing authenticated dashboard using realistic, internally consistent dummy data.

The dashboard must be a usable product prototype, not just a visual mockup.

Use a persistent application shell with:

* Sidebar navigation.
* Organization/project selector.
* Date range selector.
* Notifications entry point.
* User profile menu.
* Main content area.
* Responsive navigation behavior.

Keep marketing navigation and dashboard navigation visually related but distinct.

## Sidebar structure

### Overview

* Overview

### Analytics

* Cost & Attribution
* Trends
* Usage Explorer

### Intelligence

* Leak Detection
* Alerts
* Reports

### Settings

* Project Settings
* Organization Settings

Use clear active states and sensible icons. Avoid icon overload.

The sidebar should collapse or become a mobile drawer on smaller screens.

---

# 10. Dashboard Pages and Requirements

Implement all the following routes with functional navigation and meaningful sample content.

## A. Overview

This is the main dashboard landing page.

It should answer:

* How much did we spend?
* Is spending increasing or decreasing?
* What is driving the spend?
* Are there active issues?
* What should I investigate first?

Include:

1. Total spend for the selected period.
2. Percentage change versus the previous comparable period.
3. Total requests.
4. Total tokens, with input and output breakdown.
5. Average cost per request.
6. Open alerts or findings.
7. Spend trend chart.
8. Cost by feature.
9. Cost by model.
10. Recent alerts or notable activity.
11. Top expensive workflows or features.

Each metric should have clear labeling, consistent number formatting, and appropriate contextual information.

Avoid making every metric a large card. Establish visual hierarchy and use different presentation patterns where appropriate.

The most important insight should receive the most attention.

## B. Cost & Attribution

Help users understand where their AI spending comes from.

Include:

* Cost by feature.
* Cost by user.
* Cost by model.
* Cost by project or environment.
* Cost by session.
* Cost by provider.
* Time-based attribution.
* Search, sorting, and filters.

Allow a user to select an attribution dimension and see the visualization and table update using dummy data.

Clicking a row should open a detail view or navigate to a relevant filtered view.

Do not show unrelated or contradictory totals across visualizations.

## C. Trends

Focus on changes over time.

Include:

* Spend trend.
* Request volume.
* Token usage.
* Input versus output tokens.
* Model mix.
* Cost per request.
* Period comparison.
* Date-range controls.
* Granularity controls where meaningful.

Changing the date range must visibly update the sample dataset or chart presentation. Do not implement controls that appear interactive but do nothing.

## D. Usage Explorer

Create a searchable, filterable request-level table.

Suggested columns:

* Timestamp.
* Request ID.
* Feature.
* User.
* Model.
* Provider.
* Input tokens.
* Output tokens.
* Total tokens.
* Estimated cost.
* Latency.
* Status.

Include:

* Search.
* Date filter.
* Provider filter.
* Model filter.
* Feature filter.
* Status filter.
* Sorting.
* Pagination or a clearly bounded dataset.
* Row selection.
* Request detail drawer or detail page.

The detail view should show available sample information such as token breakdown, cost, latency, model, associated feature, and relevant metadata.

Never show full prompts or completions as though ACLP automatically collects them.

## E. Leak Detection

This page is a key differentiator.

Create a findings experience that explains potential cost waste in understandable language.

Include example finding types:

* Duplicate prompts.
* Retry loops.
* Context growth.
* Oversized prompts.
* Spend spikes.
* Unusual token consumption.
* Unexpected model usage.
* Potentially inefficient workflows.

Each finding should include:

* Title.
* Severity.
* Detection status.
* Affected feature or model.
* First detected time.
* Last observed time.
* Evidence summary.
* Estimated impact, if the sample data supports it.
* Suggested investigation or next step.
* Link to related usage records.

Use clear distinctions between:

* Observed measurements.
* Estimated impact.
* Suggested actions.

Do not imply that a recommendation has been automatically applied.

A finding should be clickable and lead to a detailed explanation.

## F. Alerts

Build a useful alert-management interface.

Include:

* Active and resolved tabs.
* Severity filters.
* Status filters.
* Alert list.
* Alert detail.
* Related data.
* Acknowledge action.
* Resolve/reopen action.
* Clear timestamps and descriptions.

These actions should work locally in the frontend and update the visible sample state.

Do not imply that an email or external notification was actually sent.

## G. Reports

Create an initial reports page.

Include:

* Spend summary.
* Usage summary.
* Top cost drivers.
* Findings summary.
* Period selection.
* A report preview.
* A functional client-side export to CSV for an appropriate sample dataset, if practical.

Do not build a fake PDF export button that does nothing.

## H. Project Settings

Include the following settings sections:

1. General project details.
2. SDK installation.
3. Provider configuration.
4. API key management interface.
5. Pricing configuration.
6. Alert thresholds.
7. Data retention.
8. Project environments.

For the initial version:

* Use dummy values.
* Mask sensitive key strings.
* Never expose real secrets.
* Allow users to copy safe sample installation commands.
* Provide working local interactions for editable controls.
* Clearly label values as sample or placeholder configuration.

Do not create actual API keys or pretend that settings have been persisted to a backend.

## I. Organization Settings

Include:

* Organization profile.
* Members.
* Roles.
* Invitations.
* Audit log.
* Billing placeholder.

Use realistic sample users and roles.

Invitation forms may validate and update a local pending-invitation list, but must not send real invitations.

Do not invent actual billing integrations.

---

# 11. Authentication and Onboarding Screens

Create the initial UI for:

* Sign in.
* Sign up.
* Forgot password.
* Organization creation.
* Initial project setup.
* SDK setup / onboarding.

These are frontend-only flows.

Use React Hook Form and Zod for validation.

For now:

* Submitting valid demo credentials can navigate to the dashboard.
* Sign-up can proceed through a local simulated flow.
* Password reset can display a confirmation state without sending an email.
* Project creation can use local sample state.

Clearly separate simulated behavior from real authentication. Do not imply that user accounts are actually created or that credentials are securely transmitted to a backend.

Use a consistent, polished visual language across all authentication screens.

---

# 12. Dummy Data Architecture

This is a critical requirement.

Do not hardcode sample data directly into page components.

Create a centralized mock-data layer with TypeScript types and realistic data fixtures.

Suggested structure:

* `src/lib/mock-data/`
* `src/lib/mock-data/overview.ts`
* `src/lib/mock-data/usage.ts`
* `src/lib/mock-data/alerts.ts`
* `src/lib/mock-data/findings.ts`
* `src/lib/mock-data/projects.ts`
* `src/lib/mock-data/organization.ts`

Create shared domain types in a dedicated directory.

Examples:

* `UsageRecord`
* `CostSummary`
* `CostAttribution`
* `TrendPoint`
* `LeakFinding`
* `Alert`
* `Project`
* `OrganizationMember`
* `AuditLogEntry`

Ensure sample data is internally consistent.

For example:

* Total spend should reconcile with the records used to calculate it.
* Input plus output tokens should equal total tokens.
* Chart totals should match the selected period.
* Alert counts should match the visible alert dataset.
* Finding details should link to actual sample records.
* Date filters should affect displayed results.
* Currency formatting should be consistent.

Use believable values and realistic variation. Avoid suspiciously round values everywhere.

Create a small mock service or repository layer that returns typed data. Pages should consume this layer rather than importing large fixture arrays directly.

This will make future API integration easier.

**Do not build an API client, connect to the backend, or require environment variables for the initial frontend.**

---

# 13. Reusable Component System

Create reusable components for common patterns.

Suggested components:

### Layout

* MarketingHeader
* MarketingFooter
* AppSidebar
* AppHeader
* DashboardShell
* PageHeader
* ResponsiveNavigation

### Data display

* MetricDisplay
* MetricChange
* ChartContainer
* ChartTooltip
* DataTable
* StatusBadge
* SeverityBadge
* EmptyState
* ErrorState
* LoadingSkeleton
* DateRangeSelector
* FilterBar

### Interaction

* DetailDrawer
* ConfirmationDialog
* Tabs
* SearchInput
* SelectFilter
* CopyButton
* Toast feedback
* Local form controls

### Marketing

* HeroVisualization
* ProblemComparison
* CostLeakExample
* ProductDemo
* NarrativeSection
* WorkflowDiagram
* FinalCTA

Avoid building a component library for its own sake. Reuse components when they represent a genuine shared pattern.

Do not make every element a card. Use dividers, typography, tables, open layouts, and controlled backgrounds to establish hierarchy.

---

# 14. Charts and Data Visualization

Use Recharts with custom styling.

Charts should be:

* Legible.
* Responsive.
* Accessible where practical.
* Consistent with the color system.
* Properly labeled.
* Formatted with appropriate currency, token, and percentage units.

Use different chart types only when they clarify the data:

* Line/area charts for trends.
* Horizontal bars for rankings.
* Stacked charts for token composition.
* Donut charts sparingly.
* Tables for precise comparisons.

Do not use decorative charts without a clear question they answer.

Tooltips should provide meaningful context.

Avoid excessive grid lines, unnecessary legends, and visual clutter.

Charts should have proper empty states when no data is available.

Use stable dimensions or aspect ratios to avoid layout shifts.

---

# 15. Functional Interaction Requirements

Although the backend is not integrated, the frontend must feel alive and usable.

Implement meaningful local interactions:

* Navigation between all pages.
* Sidebar collapse/expand.
* Date-range changes.
* Search and filtering.
* Sorting and pagination.
* Tabs.
* Row selection.
* Detail drawers.
* Alert acknowledgement and resolution.
* Local settings edits.
* Form validation.
* Copy-to-clipboard interactions.
* Demo replay and reset.
* Interactive marketing demo.
* CSV export where practical.
* Toasts or inline feedback for local actions.

Do not create decorative controls that appear functional but have no behavior.

If an action cannot be implemented in the frontend-only phase, disable it clearly or mark it as coming soon.

---

# 16. Responsive Design

Design for:

* Large desktop.
* Standard laptop.
* Tablet.
* Mobile.

Do not treat mobile as a squeezed desktop layout.

Marketing:

* Preserve the narrative.
* Reflow editorial compositions.
* Keep headings readable.
* Ensure the interactive demo remains usable.
* Avoid horizontal overflow.

Dashboard:

* Convert the sidebar to a mobile drawer.
* Stack metric displays appropriately.
* Make tables horizontally scrollable or provide a suitable compact alternative.
* Keep filters accessible.
* Ensure drawers and dialogs fit within the viewport.
* Maintain readable chart labels.

Test at representative viewport sizes.

---

# 17. Accessibility

Follow accessible interaction and semantic HTML practices.

Requirements:

* Keyboard navigation.
* Visible focus indicators.
* Proper form labels.
* Accessible dialogs and drawers.
* Semantic headings.
* Meaningful button labels.
* Sufficient contrast.
* Reduced-motion support.
* Non-color-only status indicators.
* Appropriate chart summaries or accessible supporting data.
* Logical tab order.

Do not sacrifice accessibility for visual effects.

---

# 18. Performance and Code Quality

* Use strict TypeScript.
* Avoid `any` unless absolutely necessary and documented.
* Keep components focused.
* Avoid unnecessary client-side JavaScript.
* Lazy-load heavy sections where appropriate.
* Avoid layout shifts.
* Use optimized image handling.
* Keep animation performant.
* Avoid duplicate logic.
* Use consistent naming.
* Ensure linting and build checks pass.
* Avoid suppressing TypeScript or lint errors without a clear reason.

Do not add unnecessary dependencies.

---

# 19. Suggested Project Structure

Adapt this structure to the repository while keeping concerns separated.

```text
src/
  app/
    (marketing)/
      page.tsx
      layout.tsx
    (auth)/
      sign-in/
      sign-up/
      forgot-password/
      onboarding/
    (dashboard)/
      layout.tsx
      overview/
      attribution/
      trends/
      usage/
      findings/
      alerts/
      reports/
      project-settings/
      organization-settings/
    globals.css

  components/
    ui/
    marketing/
    dashboard/
    charts/
    tables/
    forms/
    shared/

  lib/
    mock-data/
    mock-services/
    formatters/
    utils/
    constants/

  types/
    domain/
    ui/

  hooks/
  config/
```

Use route groups and layouts where they improve separation.

Keep the marketing and dashboard design systems related through shared tokens, not by forcing identical layouts.

---

# 20. Implementation Sequence

Work in the following order.

### Phase 1 — Foundation

1. Inspect the existing repository.
2. Set up or preserve the Next.js application.
3. Configure TypeScript, Tailwind, shadcn/ui, and dependencies.
4. Establish typography, colors, spacing, radius, and motion tokens.
5. Create shared layout and utility components.
6. Confirm the application builds.

### Phase 2 — Marketing website

1. Build the complete homepage narrative.
2. Implement the hero and product visualization.
3. Build the problem comparison.
4. Build the cost leak examples.
5. Build the interactive product demo.
6. Build the workflow and trust sections.
7. Complete the CTA, header, and footer.
8. Test responsiveness and motion behavior.

Do not postpone the marketing site until after the dashboard. It is a core part of the product.

### Phase 3 — Dashboard shell

1. Build the authenticated layout.
2. Implement sidebar and header.
3. Create navigation and route structure.
4. Establish page headers, tables, filters, and chart containers.

### Phase 4 — Data and pages

1. Create typed sample data.
2. Implement the mock service layer.
3. Build Overview.
4. Build Cost & Attribution.
5. Build Trends.
6. Build Usage Explorer and request detail.
7. Build Leak Detection and finding details.
8. Build Alerts.
9. Build Reports.
10. Build Project Settings.
11. Build Organization Settings.

### Phase 5 — Authentication and onboarding

1. Build sign-in and sign-up.
2. Build forgot-password state.
3. Build local onboarding.
4. Connect simulated flows to the dashboard.

### Phase 6 — Polish and verification

1. Test every route.
2. Test every visible interactive control.
3. Verify data consistency.
4. Check responsive behavior.
5. Check reduced-motion behavior.
6. Run lint and build.
7. Fix all errors.
8. Document how to run the frontend.

---

# 21. Acceptance Criteria

The initial frontend is complete only when all of the following are true:

* [ ] The marketing homepage tells a coherent story from problem to product to action.
* [ ] The hero is distinctive and does not resemble a generic SaaS template.
* [ ] The product is demonstrated through an interactive sample experience.
* [ ] Typography feels intentional and memorable.
* [ ] Animations are smooth, subtle, and purposeful.
* [ ] The interface does not rely on decorative gradients, glow, or generic floating elements.
* [ ] All dashboard routes exist and are navigable.
* [ ] The dashboard contains realistic, internally consistent dummy data.
* [ ] Overview communicates spend, changes, drivers, and issues clearly.
* [ ] Attribution, Trends, and Usage Explorer have meaningful interactions.
* [ ] Leak Detection explains findings with evidence and next steps.
* [ ] Alerts support local state changes.
* [ ] Settings forms validate and provide local feedback.
* [ ] Authentication and onboarding have complete simulated flows.
* [ ] No real backend integration is required.
* [ ] No environment variables are required to run the initial frontend.
* [ ] There are no dead buttons or misleading interactions.
* [ ] The interface works on desktop, tablet, and mobile.
* [ ] Accessibility and reduced-motion considerations are implemented.
* [ ] The application passes linting and production build checks.
* [ ] The repository includes clear run instructions.

---

# 22. Final Instructions

Think like a product designer, not just a developer.

Do not rush into writing components before understanding the visual system and narrative.

Prioritize:

1. A memorable, story-driven marketing experience.
2. A convincing interactive product demonstration.
3. A coherent and polished dashboard.
4. Meaningful local interactions.
5. Clean architecture that will support future API integration.

The goal is not to make ACLP look like every other AI SaaS product.

The goal is to make a visitor think:

**"I understand the problem, I can see how this product solves it, and I want to explore it further."**

Build the initial frontend to that standard, while keeping the implementation practical, maintainable, and ready for the next development phase.
