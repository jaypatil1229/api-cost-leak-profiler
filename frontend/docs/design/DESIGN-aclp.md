# ACLP — Brand Identity & Design System

**Version:** 0.1 — Creative Direction
**Status:** Proposed foundation for frontend implementation
**Product:** API Cost Leak Profiler
**Category:** LLM Cost Intelligence & Observability

---

## 1. The Brand in One Sentence

**ACLP makes the invisible economics of AI applications visible, understandable, and actionable.**

We are building a product that helps engineering teams understand not just how much they spend on LLM APIs, but which features, users, models, and request patterns are responsible for that spend.

The design must communicate this same promise. It should turn complex information into something that feels clear, composed, and easy to investigate.

### Brand principles

1. **Clarity over decoration.** Every visual element should help explain, guide, or establish hierarchy.
2. **Confidence without noise.** The product should feel mature and trustworthy, not loud or excessively playful.
3. **Intelligence through detail.** Thoughtful typography, precise data visualization, and meaningful interactions should demonstrate craft.
4. **Evidence before claims.** Findings, cost estimates, and recommendations must be traceable to real data or explicitly labeled as illustrative.
5. **Fluidity with purpose.** Motion should make the interface feel responsive and connected, never distract from the content.
6. **One identity, two experiences.** The marketing website can be expressive; the application must be disciplined. Both should clearly belong to ACLP.

---

## 2. Positioning and Voice

### Positioning

ACLP is an LLM cost intelligence platform that connects API expenditure to the application behavior behind it.

It helps teams move from aggregate billing to request-level understanding, then from understanding to optimization.

### Primary message

**Make every AI dollar make sense.**

Supporting message:

*See where your AI spend goes. Understand why. Know what to fix.*

### Brand personality

| Trait      | How it should appear                                           |
| ---------- | -------------------------------------------------------------- |
| Analytical | Clear evidence, meaningful comparisons, precise numbers        |
| Calm       | Restrained color, generous spacing, unhurried motion           |
| Technical  | Credible interfaces, code examples, detailed explanations      |
| Human      | Plain language, approachable onboarding, no unnecessary jargon |
| Confident  | Direct copy, intentional layouts, no exaggerated promises      |
| Considered | Every component feels deliberately designed                    |

### Voice rules

**Use:**

* Specific, concise language.
* Explanations tied to evidence.
* Clear distinctions between observed, estimated, and potential savings.
* Helpful language that guides the next action.

**Avoid:**

* Generic phrases such as "Revolutionize your AI journey."
* Unsubstantiated claims such as "Save 80% instantly."
* Excessive exclamation marks.
* Artificial urgency.
* Overuse of AI buzzwords.
* Copy that sounds like a generic SaaS template.

---

## 3. Design Inspiration and What We Take From It

These references are sources of design principles, not templates to reproduce.

| Reference      | Learn from                                                             | Do not copy                                   |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| Stripe         | Narrative structure, clarity, product education, conversion flow       | Signature gradient identity                   |
| Linear         | Interface polish, interaction discipline, information hierarchy        | Exact application layout or palette           |
| Vercel / Geist | Grid precision, typography discipline, technical credibility           | Entire black-and-white visual identity        |
| Apple          | Tactile interactions, calm motion, visual pacing, product presentation | Consumer-hardware visual clichés              |
| Raycast        | Product-led marketing, interface demonstrations, detail                | Exact dark command-palette aesthetic          |
| PostHog        | Distinctive brand voice, originality, content-first illustrations      | Character system and saturated color language |
| Langfuse       | Technical education, observability workflows, developer credibility    | Generic observability dashboard conventions   |

### Our synthesis

ACLP should combine:

* The storytelling discipline of Stripe.
* The interaction quality of Linear.
* The technical precision of Vercel.
* The fluidity and pacing of Apple.
* The product-first presentation of Raycast.
* An original visual signature rooted in investigation, traceability, and cost intelligence.

The result should not immediately remind someone of any one reference.

---

## 4. Typography — A Deliberate Brand Choice

Typography is a primary part of ACLP's identity, not a finishing detail.

We should avoid choosing a font simply because it is popular in modern SaaS interfaces. The type system needs character at display sizes while remaining highly legible in dense data tables.

### Typeface candidates

#### Display / marketing headlines

| Typeface             | Character                                  | Consideration                                                                  |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| **Tiempos Headline** | Editorial, confident, distinctive          | Strong candidate for large narrative headlines; commercial licensing           |
| **Canela**           | Refined, expressive, premium               | Beautiful but can feel too fashion/editorial if overused; commercial licensing |
| **Editorial New**    | High-contrast, contemporary editorial      | Distinctive for selected statement headlines; commercial licensing             |
| **Cabinet Grotesk**  | Strong, modern, geometric with personality | A more technical, less traditional alternative to a serif display face         |
| **Clash Display**    | Expressive, contemporary, high-impact      | Use selectively; avoid making the brand feel like a design-agency portfolio    |

#### Interface / body

| Typeface             | Character                                                         | Consideration                                                                                    |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Söhne**            | Human, precise, quietly distinctive                               | Preferred premium interface candidate; commercial licensing                                      |
| **PP Neue Montreal** | Contemporary, confident, editorial undertone                      | Excellent for a product that wants personality without sacrificing clarity; commercial licensing |
| **General Sans**     | Modern, balanced, slightly more characterful than common defaults | Strong practical candidate                                                                       |
| **Onest**            | Clean, contemporary, technical                                    | Alternative for a restrained product interface                                                   |
| **Suisse Intl**      | Highly composed, neutral, professional                            | Excellent but commercially licensed                                                              |

#### Technical / data

| Typeface          | Character                       | Use                                                       |
| ----------------- | ------------------------------- | --------------------------------------------------------- |
| **Berkeley Mono** | Distinctive, crafted, technical | Preferred premium choice for code and technical details   |
| **IBM Plex Mono** | Technical, readable, familiar   | Strong open-source alternative                            |
| **Commit Mono**   | Precise, contemporary           | Alternative for API examples and developer-facing details |

### Recommended typographic direction

**Premium direction:**

* Display: Tiempos Headline
* Interface: Söhne
* Technical: Berkeley Mono

This creates a deliberate contrast: editorial storytelling on the public website, composed sans-serif typography in the application, and a distinctive monospaced voice for technical data.

**Alternative direction if we prefer a fully sans-serif identity:**

* Display: Cabinet Grotesk
* Interface: PP Neue Montreal
* Technical: Berkeley Mono

This would feel more contemporary and product-led, with less editorial contrast.

**Practical fallback direction:**

* Display: Newsreader
* Interface: General Sans
* Technical: IBM Plex Mono

Final font selection must be tested in actual hero, dashboard, and table layouts before implementation. Confirm licensing and self-hosting requirements before committing to production assets.

### Typography principles

* Headlines should have deliberate line breaks, not arbitrary wrapping.
* Use optical sizing and variable weights where supported.
* Large display type may use tight tracking; body text should remain comfortable.
* Avoid excessive uppercase labels.
* Numeric data must use tabular figures where alignment matters.
* Never sacrifice legibility for a stylistic effect.
* The marketing website and application should share the interface family, even when the marketing site uses an additional display face.

---

## 5. Color Identity

### Creative direction

A warm, neutral foundation with deep ink, a distinctive muted blue, and carefully controlled semantic colors.

The palette should feel like a sophisticated analytical instrument, not a generic AI product.

No full-page neon gradients. No glowing blue cards. No decorative rainbow gradients. Color must communicate structure, interaction, or meaning.

### Core palette — initial tokens

| Token           | Hex       | Purpose                             |
| --------------- | --------- | ----------------------------------- |
| `canvas`        | `#F7F7F4` | Primary marketing background        |
| `surface`       | `#FFFFFF` | Cards, panels, elevated surfaces    |
| `surface-muted` | `#F0F1EE` | Subtle section contrast             |
| `ink`           | `#182333` | Primary text and dark surfaces      |
| `body`          | `#4C5868` | Body copy                           |
| `muted`         | `#788392` | Secondary information               |
| `faint`         | `#A1A9B3` | Low-emphasis metadata               |
| `border`        | `#E3E6E8` | Structural boundaries               |
| `border-strong` | `#CDD3D9` | Emphasized boundaries               |
| `accent`        | `#315D9B` | Primary actions and links           |
| `accent-hover`  | `#244A80` | Hover and pressed state             |
| `accent-soft`   | `#E8EEF7` | Selected states and subtle emphasis |
| `accent-ink`    | `#19385F` | High-contrast accent text           |

These are starting values. Verify contrast and visual balance in the actual implementation.

### Semantic colors

| Semantic token | Color     | Meaning                                  |
| -------------- | --------- | ---------------------------------------- |
| `success`      | `#23856D` | Healthy status and verified improvements |
| `warning`      | `#B77C26` | Attention required                       |
| `critical`     | `#BD4B52` | Critical conditions and failures         |
| `info`         | `#4779B8` | Informational state                      |

Semantic colors must be used consistently and never as arbitrary decoration.

### Dark application theme

The dashboard should support both light and dark modes.

The dark theme should use deep, slightly warm blue-black surfaces rather than absolute black. Borders should remain visible but quiet. Text contrast must be comfortable for extended use.

Dark mode is a workspace preference, not a requirement that every marketing section be dark.

### Color rules

* Use neutral surfaces for most of the interface.
* Accent color should be scarce enough to retain meaning.
* Never encode status by color alone.
* Charts should prioritize readability over visual spectacle.
* Avoid gradients as a default surface treatment.
* Do not use translucent glass panels everywhere.
* Avoid excessive colored shadows and glows.
* Keep the same semantic meaning across marketing demonstrations and application screens.

---

## 6. Layout and Composition

### Overall feel

Editorial composition meets technical precision.

The website should feel spacious and deliberate, with strong alignment, intentional asymmetry, and a clear rhythm between narrative sections and product demonstrations.

The application should be compact and efficient without becoming visually cramped.

### Layout tokens

Use a 4px base spacing system.

| Token      | Value |
| ---------- | ----: |
| `space-1`  |   4px |
| `space-2`  |   8px |
| `space-3`  |  12px |
| `space-4`  |  16px |
| `space-5`  |  20px |
| `space-6`  |  24px |
| `space-8`  |  32px |
| `space-10` |  40px |
| `space-12` |  48px |
| `space-16` |  64px |
| `space-20` |  80px |
| `space-24` |  96px |
| `space-32` | 128px |

### Containers

* Marketing content: maximum width approximately 1200–1280px.
* Long-form text: narrower measure for comfortable reading.
* Hero: allow more expressive composition, with a clear content anchor.
* Dashboard: use the available width efficiently while maintaining consistent gutters.
* Avoid stretching every component to the full viewport width.

### Radius

Use a restrained radius system:

* Small controls: 6–8px.
* Standard cards: 12–16px.
* Large demo panels: 18–24px.
* Pills only where they improve the interaction or create a deliberate marketing contrast.

Do not make every component a pill or every card excessively rounded.

### Borders and elevation

* Prefer thin borders and surface contrast over shadows.
* Use shadows primarily for floating elements such as menus, dialogs, and popovers.
* Cards should feel grounded, not like floating tiles.
* Avoid excessive nested cards.
* Use dividers and whitespace to create hierarchy.

---

## 7. Motion and Interaction Language

**Motion is a core part of ACLP's design identity.**

The target is the calm, tactile quality of Apple's interface transitions: smooth, connected, and intentional. The goal is not to imitate a specific animation, but to apply the same discipline.

Animation should help users understand spatial relationships, state changes, and narrative progression.

### Motion principles

1. **Subtle over spectacular.** Motion should be noticed as polish, not as a performance.
2. **Continuity over spectacle.** Elements should feel like they transition from one state to another rather than disappear and reappear.
3. **Natural easing.** Prefer smooth, softened acceleration and deceleration.
4. **Purposeful timing.** Small controls should respond quickly; larger narrative transitions may take longer.
5. **No forced waiting.** Never delay a user action for the sake of an animation.
6. **Respect reduced motion.** Every important interaction must remain understandable without animation.
7. **Performance first.** Prefer transform and opacity. Avoid animating expensive layout properties or causing scroll jank.

### Motion tokens

| Token             |  Duration | Use                                                 |
| ----------------- | --------: | --------------------------------------------------- |
| `motion-instant`  |     100ms | Press feedback and tiny state changes               |
| `motion-fast`     |     160ms | Hover, focus, button feedback                       |
| `motion-standard` |     240ms | Menus, tabs, small panels                           |
| `motion-smooth`   |     360ms | Cards, drawers, transitions                         |
| `motion-emphasis` |     500ms | Hero reveals and selected narrative transitions     |
| `motion-story`    | 650–800ms | Larger product-story sequences, only when justified |

Suggested easing:

* Standard: `cubic-bezier(0.22, 1, 0.36, 1)`
* Enter: `cubic-bezier(0.16, 1, 0.3, 1)`
* Exit: `cubic-bezier(0.4, 0, 1, 1)`

These are starting tokens. Tune them against real interactions rather than applying them mechanically.

### Approved motion patterns

**Micro-interactions**

* Buttons subtly change surface and position on hover or press.
* Interactive cards may lift by 1–2px.
* Icons can transition between states smoothly.
* Focus indicators appear immediately and clearly.

**Content transitions**

* Panels can crossfade or slide a few pixels when switching views.
* Drawers should feel connected to the element that opened them.
* Tabs should use a restrained sliding indicator.
* Loading states should avoid abrupt layout shifts.

**Scroll storytelling**

* Sections may reveal through gentle opacity and vertical movement.
* Use staggered entrances sparingly.
* Large product demonstrations may transition as the visitor progresses through the narrative.
* Avoid animating every paragraph and card independently.
* Do not lock scrolling or force the visitor through a sequence.

**Product demonstrations**

* Animate only the data that helps explain a concept.
* Use deliberate transitions when changing chart ranges or investigation states.
* Show causal relationships between metrics and findings.
* Use real interactions rather than decorative motion wherever possible.

### Forbidden motion patterns

* Constant floating or bobbing elements.
* Infinite decorative loops.
* Aggressive parallax.
* Large bouncing elements.
* Flashing or pulsing alerts without a genuine operational reason.
* Excessive spring effects.
* Cursor-following decoration.
* Scroll hijacking.
* Animations that delay access to content.
* Motion that creates accessibility or performance problems.

### Reduced motion

Respect `prefers-reduced-motion`.

When enabled:

* Remove nonessential movement.
* Replace large transforms with immediate state changes or restrained fades.
* Preserve functional feedback.
* Never hide information behind an animation.

---

## 8. The Marketing Homepage — A Story, Not a Feature Catalogue

The homepage is the public face of ACLP. It must communicate the problem, reveal the insight, demonstrate the product, and earn trust.

Do not build a conventional sequence of a hero, generic feature cards, testimonials, pricing, and FAQ.

The page should feel like a guided investigation.

### Chapter 1 — The blind spot

**Headline:** Your AI bill is only telling half the story.

The opening should establish the gap between aggregate billing and actionable understanding.

Visual direction:

* A quiet, editorial hero.
* Strong typography.
* A small but compelling product or data composition.
* No generic AI illustrations.
* No decorative gradient orb.
* Clear primary and secondary actions.

### Chapter 2 — The question

**Headline:** You know what you spent. But do you know why?

Introduce a realistic cost figure, then reveal how that total can be attributed to features, users, models, and requests.

The visitor should experience the difference between a bill and an investigation.

### Chapter 3 — The discovery

**Headline:** The expensive part isn't always the obvious part.

Show an illustrative scenario involving duplicated prompts, retry behavior, growing context, oversized requests, or a spend anomaly.

Make the cause-and-effect relationship clear.

Do not invent product capabilities or imply that a simulated finding is real.

### Chapter 4 — The product

**Headline:** Meet the layer that connects every request to its cost.

Introduce the actual ACLP interface.

The product should be presented as a working experience, not a flat screenshot.

### Chapter 5 — The investigation

**Headline:** From signal to explanation to action.

Demonstrate a complete workflow:

1. A cost anomaly appears.
2. The user opens the finding.
3. The evidence identifies the relevant requests.
4. The user inspects the responsible feature or model.
5. The interface presents an explanation and a next step.

The workflow must be consistent with implemented functionality.

### Chapter 6 — The trust layer

Explain:

* SDK integration.
* Supported providers.
* What telemetry is collected.
* What is not collected.
* Cost-estimation methodology.
* Data handling and privacy boundaries.
* How the system behaves when a component is unavailable.

Avoid unsupported security or performance claims.

### Chapter 7 — The invitation

**Headline:** Start seeing what your AI spend is really doing.

Use one clear primary CTA and a simple route into onboarding or the demo.

---

## 9. Signature Experience — Interactive Cost Investigation

The homepage should include a controlled, interactive demonstration of the product's central value.

This is not a decorative animation. It is a small, understandable product story.

### Example sequence

**Initial state:** A daily spend chart shows an unexpected increase.

**Interaction 1:** The visitor selects the increase.

**Transition:** The view moves into a breakdown by feature.

**Interaction 2:** The visitor selects the feature responsible for the largest share of the increase.

**Transition:** A request-level view appears, with relevant records highlighted.

**Interaction 3:** The visitor opens a finding.

**Reveal:** The explanation, supporting evidence, and potential next step become visible.

**Conclusion:** The visitor understands how ACLP connects an aggregate cost change to the behavior behind it.

### Demo requirements

* Use realistic but clearly labeled sample data.
* Provide a reset or replay action.
* Support keyboard navigation.
* Keep the sequence optional; visitors must be able to explore the rest of the page without completing it.
* Use smooth transitions, not theatrical effects.
* Ensure the demo remains usable on mobile.
* Never represent simulated values as real customer outcomes.

---

## 10. Application Design

The dashboard is the functional expression of the brand.

It should prioritize clarity, efficiency, and consistency over marketing-style composition.

### Core visual principles

* Stable navigation and predictable layouts.
* Dense information with clear hierarchy.
* Consistent treatment of dates, currency, token counts, and percentages.
* Strong table readability.
* Clear distinction between observed values, estimates, and recommendations.
* Useful empty states and meaningful loading states.
* Explicit degraded-state messaging.
* Accessible focus and keyboard behavior.
* Responsive layouts that preserve essential information.

### Data visualization

Charts are functional communication tools, not decoration.

Rules:

* Use restrained palettes.
* Label axes and units.
* Avoid unnecessary 3D effects.
* Use direct labels where they improve understanding.
* Make comparison periods clear.
* Show missing or incomplete data honestly.
* Use annotations to explain meaningful changes.
* Ensure charts remain understandable without relying on color alone.
* Keep visual encoding consistent across the application.

### Trust and status

The UI must distinguish:

* Verified findings.
* Estimated savings.
* Potential savings.
* Incomplete telemetry.
* Missing pricing data.
* Analytics-service degradation.
* Stale or delayed information.

Never present a degraded state as healthy merely to preserve visual cleanliness.

---

## 11. Component Design Rules

### Buttons

* Clear primary, secondary, and tertiary hierarchy.
* Consistent height and alignment.
* Subtle interaction feedback.
* No exaggerated hover movement.
* Accessible focus states.

### Cards

* Use only when content benefits from grouping.
* Prefer one clear purpose per card.
* Avoid unnecessary nesting.
* Use borders and spacing before shadows.

### Tables

* Prioritize scanning and alignment.
* Use tabular numerals.
* Make sorting and filtering obvious.
* Preserve meaningful column labels on smaller screens.
* Provide accessible row actions.

### Forms

* Clear labels and validation.
* Helpful error messages.
* Consistent focus states.
* No placeholder-only labeling.

### Icons

* Use a consistent icon library and stroke weight.
* Icons must communicate meaning or support navigation.
* Do not use emoji as interface icons.
* Avoid decorative icons placed beside every heading.

### Illustrations

* Prefer product-derived diagrams, data relationships, and purposeful visual metaphors.
* Do not use generic AI brains, glowing nodes, floating orbs, or stock imagery merely to fill space.
* Every illustration should explain something about the product.

---

## 12. Accessibility and Performance

Accessibility and performance are design requirements, not post-launch polish.

* Meet WCAG 2.2 AA contrast requirements where applicable.
* Maintain visible keyboard focus.
* Provide meaningful labels for interactive elements.
* Respect reduced-motion preferences.
* Avoid color-only status communication.
* Maintain readable type at mobile sizes.
* Prevent layout shifts during loading.
* Lazy-load noncritical media.
* Prefer performant animation techniques.
* Avoid large animation libraries when native CSS or a lightweight solution is sufficient.
* Ensure the page remains usable if animations fail or are disabled.

---

## 13. Anti-Patterns — Explicitly Avoid

The following are not part of ACLP's identity:

* Generic AI startup templates.
* Neon-on-black as the default aesthetic.
* Full-screen gradient backgrounds.
* Glowing cards and buttons.
* Excessive glassmorphism.
* Random floating shapes.
* Emoji overload.
* Generic robot or brain illustrations.
* Unnecessary animated counters.
* Endless scrolling animations.
* Cards for every single piece of content.
* Arbitrary rounded corners.
* Excessive shadows.
* Fake logos or invented testimonials.
* Fake performance metrics.
* Unverified claims about savings.
* Inconsistent chart colors.
* Animations that exist only to impress.
* Copy that could belong to any AI SaaS product.

**A visual element must earn its place.**

---

## 14. Implementation Guidance

The frontend implementation should translate this document into reusable design tokens and components.

Recommended foundation:

* CSS custom properties for semantic color and motion tokens.
* A centralized typography scale.
* Shared spacing, radius, border, and elevation variables.
* Separate marketing and application layouts using the same underlying identity.
* Theme-aware components.
* Consistent motion utilities.
* A reusable chart theme.
* Shared interaction and accessibility patterns.

Do not scatter raw colors, arbitrary animation durations, or one-off typography values throughout the codebase.

Every significant design decision should be expressible through a token or documented component variant.

---

## 15. Design Acceptance Checklist

Before calling the design system complete, review the following:

* [ ] The homepage feels distinctive without relying on a gradient.
* [ ] The selected typography has recognizable character and remains readable.
* [ ] The hero communicates the product's value without generic AI language.
* [ ] The interactive demo explains a real ACLP workflow.
* [ ] The dashboard and marketing site feel like one brand.
* [ ] Motion feels smooth, calm, and intentional.
* [ ] Every animation has a purpose.
* [ ] Reduced-motion behavior is implemented.
* [ ] Data visualization is consistent and accessible.
* [ ] Real, estimated, and illustrative values are clearly distinguished.
* [ ] No fake capabilities or unverified claims appear.
* [ ] The design works at desktop, tablet, and mobile sizes.
* [ ] The experience feels polished without being visually noisy.
* [ ] The implementation uses shared tokens rather than scattered styling decisions.

---

## Final Design North Star

# Clarity is the aesthetic.

ACLP should feel like a carefully engineered instrument: composed on the surface, sophisticated underneath, and designed to make complicated information feel obvious.

**Editorial storytelling. Distinctive typography. Quiet color. Tactile motion. Real product proof. Evidence-led insights.**

Nothing should be loud merely to attract attention. Everything should be deliberate enough to earn it.
