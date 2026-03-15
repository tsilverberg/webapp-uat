# webapp-uat

> Full browser UAT for web apps — Playwright testing with console/network error capture, accessibility checks, i18n validation, and bug triage.

An [Agent Skill](https://agentskills.io) for Claude Code that runs comprehensive User Acceptance Testing on any web application using Playwright.

## Install

```bash
npx skills add mecabots/webapp-uat
```

## What It Does

When you say **"run UAT on my app"**, this skill:

1. **Discovers your screens** — reads your routes, pages, and navigation to build a test checklist
2. **Launches Playwright** — navigates each screen in a real Chromium browser
3. **Captures everything** — console errors, network failures, page crashes, rendering bugs
4. **Validates quality** — accessibility (WCAG 2.2 AA), i18n, empty/placeholder data, responsive layout
5. **Fixes bugs inline** — P0/P1 issues are fixed immediately, P2/P3 logged for later
6. **Generates a report** — per-screen scores, bug list with severity, overall health score

## Supported Stacks

Works with any web framework:

- **React** (CRA, Vite, Next.js)
- **Vue** (Vite, Nuxt)
- **Angular**
- **Svelte** (SvelteKit)
- **Ionic / Capacitor** (hybrid mobile)
- **Plain HTML/JS**

## What Gets Checked

### Every screen
- Console errors (zero-tolerance)
- Network failures (4xx, 5xx)
- Accessibility: headings, landmarks, skip links, alt text, focus management, form labels
- i18n: broken keys, unresolved placeholders, missing translations
- Data integrity: no "NaN", "undefined", "[object Object]", infinite loading
- Responsive: no horizontal overflow on mobile viewports

### Included utilities (`assets/test-helper.js`)

| Function | Purpose |
|---|---|
| `setupErrorCapture(page)` | Captures console errors, network failures, page crashes |
| `screenshot(page, name)` | Takes labeled full-page screenshots |
| `waitForSettle(page, ms)` | Waits for network idle + rendering |
| `checkBrokenI18n(page)` | Detects raw i18n keys and unresolved placeholders |
| `checkA11y(page)` | WCAG 2.2 AA basics (headings, landmarks, ARIA, forms) |
| `checkEmptyData(page)` | Finds placeholder values in data elements |
| `checkResponsiveOverflow(page)` | Detects broken mobile layouts |
| `printReport(screen, checks, errors)` | Formats per-screen results |
| `printSummary(errors, results)` | Formats final UAT summary |

## Configuration (Optional)

Create `uat.config.js` in your project root for repeatable runs. See [SKILL.md](./SKILL.md) for the full config reference.

## Authentication

Three options for authenticated testing:

1. **Interactive login** — `node assets/login-helper.js` opens a browser for manual login
2. **Saved state** — reuse a `storageState` JSON file from a previous session
3. **Programmatic** — define a login function in `uat.config.js`

## Bug Triage

Bugs are classified by severity:

| Severity | Action | Examples |
|---|---|---|
| **P0 Blocker** | Fix immediately | App won't load, data loss, complete screen failure |
| **P1 High** | Fix immediately | Feature broken, wrong data, accessibility barrier |
| **P2 Medium** | Log, fix after full pass | Visual glitch, fallback data, minor a11y issue |
| **P3 Low** | Log for later | Cosmetic, console warning, edge case |

## Origin

Battle-tested across 200+ UAT cycles on a production crypto platform with 11 screens, 6 locales, and WCAG 2.2 AA compliance requirements. Abstracted into a generic skill for any web application.

## License

MIT
