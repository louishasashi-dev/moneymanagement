# Money Management — DESIGN.md

## 1. Purpose

This document is the visual source of truth for the Money Management application.

The interface should feel like a deliberately designed personal finance tool, not a generic AI-generated dashboard, SaaS template, or UI-kit demo.

This document governs visual decisions only. `CLAUDE.md` remains the source of truth for architecture, data safety, scope, and coding behavior.

When a requested feature conflicts with this document, preserve data/functional safety first, then preserve the established visual system unless the user explicitly asks to redesign it.

---

## 2. Core Design Direction

### Desired character

The product should feel:

- calm
- precise
- practical
- trustworthy
- slightly distinctive
- information-dense without feeling crowded
- human-made rather than template-generated

The design should communicate that this is a tool someone uses repeatedly to understand their own money.

### Design principle

**Clarity over decoration. Hierarchy over symmetry. Consistency over novelty.**

Visual interest should come from typography, spacing, alignment, proportion, borders, hierarchy, and interaction states — not from decorative effects.

### Do not imitate generic dashboard aesthetics

Avoid the common pattern of:

- page title
- subtitle
- 4 identical metric cards
- large rounded container around everything
- blue/purple gradient
- generic chart card
- excessive icons
- excessive shadows
- identical rounded rectangles everywhere

A page may use cards when a card genuinely improves grouping, but a card is not the default container for every piece of information.

---

## 3. Anti-AI-Slop Rules

These are explicit design constraints.

### Do not use by default

- glassmorphism
- frosted glass panels
- glowing borders
- neon gradients
- purple/blue SaaS gradients
- decorative blobs
- random abstract background shapes
- excessive rounded corners
- excessive pill-shaped UI
- huge hero headings in utility pages
- floating cards for every metric
- identical cards repeated across the page
- decorative illustrations without functional purpose
- fake data visualizations
- decorative sparklines with no useful information
- excessive drop shadows
- hover animations that move elements unnecessarily
- animation on every component
- emoji as the primary icon system
- stock illustrations
- online design assets

### Avoid visual clichés

Do not make a design feel "modern" by automatically adding:

- gradient backgrounds
- 16–24px border radii everywhere
- heavy shadows
- oversized whitespace with little information
- giant colored metric numbers
- floating glass cards
- generic dashboard sidebars

If a visual treatment is used, it must have a clear hierarchy or interaction reason.

---

## 4. Technology Constraints

The visual system must be durable and local-first.

### Required

- semantic HTML
- project-owned CSS
- vanilla JavaScript where interaction requires it
- CSS custom properties for design tokens
- responsive CSS
- accessible focus states
- reduced-motion support

### Design must not depend on external resources

Do not introduce:

- Tailwind CSS
- Bootstrap
- Material UI
- external UI kits
- external component libraries
- CDN-hosted CSS
- CDN-hosted icon libraries
- CDN-hosted fonts
- online design assets
- remote background images
- remote SVG/icon packs

Do not add a dependency merely to style one component.

Existing third-party functional libraries may remain temporarily when they serve a non-visual function, but **new visual work must not depend on them**. When redesigning an existing area, prefer replacing external visual dependencies with local CSS/HTML/vanilla JS where practical.

The long-term goal is that the visual appearance works without network access.

---

## 5. Icons and Graphics

Prefer, in order:

1. CSS shapes for simple functional marks.
2. Inline SVG authored in the project when an icon is genuinely needed.
3. Existing local project assets when appropriate.
4. Text labels when an icon would add no useful information.

Do not fetch icons from the internet.

Do not use an icon simply because an icon is available.

Icons must support recognition, not decorate every row.

---

## 6. Typography

Typography is a primary part of the product identity.

Prefer a stable system/local font stack rather than a remotely loaded font.

Recommended baseline:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If Inter is not locally available, the fallback stack must still look intentional.

Do not introduce a remote font dependency.

### Typography hierarchy

Use a small, consistent scale.

- Page title: strong, compact, not oversized.
- Section title: clearly subordinate to page title.
- Body: comfortable reading size.
- Supporting text: quieter but still readable.
- Financial numbers: visually prominent through weight, size, and alignment rather than decorative color.
- Currency/unit labels: visually subordinate to the amount.

Do not use many font sizes on one page.

### Financial numbers

Numbers should align cleanly and be easy to scan.

Avoid decorative typography for currency values.

Use tabular numerals when available:

```css
font-variant-numeric: tabular-nums;
```

---

## 7. Color System

Color communicates financial meaning.

Use a restrained neutral foundation with a small semantic accent palette.

Required semantic roles:

- background
- surface
- elevated surface
- primary text
- secondary text
- muted text
- border
- focus
- income/success
- expense/danger
- warning
- informational/accent

Do not assign a new arbitrary color to every component.

### Financial semantics

- Income should have a consistent positive treatment.
- Expense should have a consistent negative treatment.
- Warning should be reserved for actual attention states.
- Neutral information should remain neutral.

Color should never be the only way to communicate meaning.

### Themes

The application currently supports multiple themes. Any redesign must preserve theme support and keep semantic roles consistent between themes.

Do not hard-code colors inside individual components when a design token can represent the semantic role.

---

## 8. Shape Language

Shapes should be restrained.

Use a small radius scale instead of arbitrary radii.

Suggested roles:

- small radius: inputs, buttons, compact controls
- medium radius: cards/panels
- large radius: only for special surfaces or mobile sheets

Do not use `border-radius: 999px` unless the component is intentionally a pill, status chip, or circular control.

Avoid making every element look like a capsule.

---

## 9. Depth and Borders

Prefer **borders and spacing** over shadows.

Default surfaces should usually be separated by:

- background contrast
- a subtle border
- spacing

Shadows are allowed when they communicate elevation, such as:

- modal
- popover
- mobile drawer
- floating action surface

Do not put a shadow on every card.

Avoid heavy black shadows.

---

## 10. Spacing and Layout

Use a consistent spacing scale.

Prefer a small set of spacing tokens instead of arbitrary values.

Layout should prioritize:

1. information hierarchy
2. scanability
3. interaction reachability
4. responsive behavior

Do not force every page into the same grid.

A transaction list may be dense.
A financial summary may use stronger grouping.
A settings page may be form-oriented.

Different information structures may use different layouts while sharing the same visual language.

---

## 11. Dashboard Design

The dashboard is a working surface, not a showcase.

Prioritize:

- current financial state
- important changes
- recent transactions
- actionable information
- readable trends

Do not automatically create a grid of identical cards.

Use hierarchy to distinguish primary information from supporting information.

Avoid turning every metric into a colored tile.

---

## 12. Transaction UI

Transactions are one of the most frequently used parts of the application.

They should be optimized for scanning.

A transaction row should make these relationships obvious:

- what happened
- whether it was income or expense
- amount
- category
- date/time

Secondary information should not compete with the transaction name and amount.

Transaction detail should use clear hierarchy rather than displaying every field at equal visual weight.

Repeated transactions should feel like a readable ledger, not a collection of unrelated cards.

---

## 13. Forms

Forms should feel fast and predictable.

Rules:

- labels must be clear
- inputs must have obvious focus states
- related fields should be grouped
- important fields should receive visual priority
- validation should appear close to the affected field
- do not hide important information behind decorative interactions

Do not style every input as a giant floating rounded container.

For frequently used transaction forms, optimize for keyboard, touch, and fast repeated entry.

---

## 14. Buttons

Buttons should have a clear hierarchy.

Suggested roles:

- primary: main action
- secondary: supporting action
- quiet/ghost: low-priority action
- danger: destructive action

Do not make every button visually primary.

Avoid pill buttons unless the control is intentionally a compact chip/filter.

Button labels should communicate the action.

---

## 15. Navigation

Navigation should be quiet and predictable.

Active state should be clear without relying on excessive color, glow, or animation.

Desktop and mobile navigation may use different layouts while maintaining the same hierarchy.

Do not add navigation decoration that competes with page content.

---

## 16. Modals and Drawers

Use overlays only when they improve task focus.

Modal hierarchy:

1. clear title
2. concise context if needed
3. task content
4. primary action
5. secondary/cancel action

Avoid oversized modal shells with excessive padding.

Mobile sheets/drawers should feel like part of the interface, not a floating web page inside the page.

---

## 17. States

Every important component should account for:

- default
- hover where applicable
- focus
- active/selected
- disabled
- loading where applicable
- empty
- error
- success

Empty states should be informative, not decorative.

Do not use a giant illustration just because a list is empty.

---

## 18. Motion

Motion should explain change, not advertise the interface.

Allowed:

- short page transition
- modal/drawer entry
- state transition
- selected-state feedback
- subtle hover/focus feedback

Avoid:

- bouncing UI
- continuous floating animations
- decorative motion
- large transforms on ordinary controls
- animation on every card

Respect:

```css
@media (prefers-reduced-motion: reduce) { ... }
```

---

## 19. Responsive Design

Design mobile intentionally rather than shrinking desktop layouts.

Mobile priorities:

- thumb-friendly controls
- readable financial numbers
- short navigation paths
- no horizontal scrolling for ordinary content
- forms that fit narrow screens
- tables/lists transformed when necessary

Do not create a separate visual identity for mobile.

---

## 20. Accessibility

Visual design must maintain:

- sufficient contrast
- visible keyboard focus
- readable text sizes
- meaningful labels
- semantic controls
- non-color-only status communication
- touch targets large enough for comfortable use

Never remove focus outlines without providing an equally visible replacement.

---

## 21. CSS Architecture

The main visual system belongs in project CSS.

Use:

- design tokens at `:root`
- theme overrides through existing theme selectors
- reusable component classes
- semantic utility classes only when genuinely useful
- media queries for responsive behavior

Avoid inline styles for reusable UI.

Avoid scattering arbitrary colors, radii, shadows, and spacing values throughout JavaScript-generated HTML.

JavaScript may toggle classes and state attributes, but CSS should own visual presentation.

---

## 22. JavaScript and Design Boundary

JavaScript is responsible for:

- data
- state
- interaction
- dynamic content
- toggling visual state classes/attributes

CSS is responsible for:

- layout
- color
- typography
- spacing
- borders
- shadows
- transitions
- responsive behavior

Do not generate large inline style strings from JavaScript when a CSS class can represent the state.

---

## 23. Component Consistency

Before creating a new component, check whether an existing component already expresses the same interaction.

If a new component is necessary, it should reuse the same:

- typography
- spacing
- radius scale
- border treatment
- semantic colors
- interaction states

Do not create five visually different versions of the same control.

---

## 24. Design Review Checklist

Before considering a visual change complete:

### Identity
- Does it look like Money Management rather than a generic dashboard?
- Does it follow the established visual language?

### Hierarchy
- Is the most important information visually dominant?
- Are secondary details quieter?

### Restraint
- Did we avoid unnecessary gradients, shadows, pills, icons, and decoration?
- Did we avoid making every element a card?

### Local-first
- Did we introduce any remote visual asset?
- Did we introduce any CDN CSS/icon/font?
- Can the design work offline?

### Responsive
- Does it work on narrow screens?
- Are controls comfortable to tap?

### Accessibility
- Is focus visible?
- Is color contrast adequate?
- Is meaning communicated without color alone?

### Maintainability
- Are visual values represented by tokens/classes?
- Did JavaScript avoid embedding presentation unnecessarily?
- Did the change avoid unrelated redesign/refactoring?
