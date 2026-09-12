# CI Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant CI work while preserving the complete Chromium, Firefox, and WebKit validation suite on pull requests and `main`.

**Architecture:** Keep the existing single verification job and its explicit production build, then make Playwright reuse that build only when `CI` is set. Reuse setup-node's npm cache, avoid unrelated install-time network calls, and cancel obsolete runs through a workflow concurrency group.

**Tech Stack:** GitHub Actions, npm, Vite, Playwright, TypeScript.

## Global Constraints

- Pull requests and pushes to `main` must continue to run the complete three-browser Playwright suite.
- CI must build production assets exactly once.
- Local `npm run test:e2e` must remain self-contained and build before preview.
- Browser binaries must not be added to the GitHub Actions cache.
- Existing retry, worker, report, and failure-artifact behavior must remain unchanged.

---

### Task 1: Remove Redundant Work and Cancel Stale Runs

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: GitHub's `CI=true` environment and the existing `dist` output from `npm run build`.
- Produces: `webServer.command` equal to `npm run preview -- --host 127.0.0.1` in CI and `npm run build && npm run preview -- --host 127.0.0.1` locally.

- [ ] **Step 1: Record the current redundant behavior**

Run:

```bash
CI=true npx tsx --eval "import config from './playwright.config.ts'; console.log(config.webServer?.command)"
```

Expected: output includes `npm run build && npm run preview`, proving CI rebuilds before E2E.

- [ ] **Step 2: Make the preview command environment-aware**

Define the command once in `playwright.config.ts`:

```ts
const previewCommand = process.env.CI
  ? 'npm run preview -- --host 127.0.0.1'
  : 'npm run build && npm run preview -- --host 127.0.0.1'
```

Set `webServer.command` to `previewCommand`; do not change the URL, reuse behavior, timeout, browser projects, worker count, retries, or reporters.

- [ ] **Step 3: Optimize safe workflow work**

Add this workflow-level cancellation policy:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

Set `cache-dependency-path: package-lock.json` under `actions/setup-node`, and replace `npm ci` with:

```yaml
- run: npm ci --prefer-offline --no-audit --no-fund
```

Keep the complete browser installation and `npm run test:e2e` steps unchanged.

- [ ] **Step 4: Verify both preview paths and workflow syntax**

Run:

```bash
CI=true npx tsx --eval "import config from './playwright.config.ts'; console.log(config.webServer?.command)"
npx tsx --eval "delete process.env.CI; import('./playwright.config.ts').then(({ default: config }) => console.log(config.webServer?.command))"
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/ci.yml', aliases: true); puts 'workflow yaml ok'"
```

Expected: CI prints preview only, local prints build plus preview, and Ruby prints `workflow yaml ok`.

- [ ] **Step 5: Run the full validation gate**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:standalone
npm run test:e2e
git diff --check
```

Expected: every command exits successfully; Playwright retains all three projects.

- [ ] **Step 6: Commit and push**

```bash
git add .github/workflows/ci.yml playwright.config.ts docs/superpowers/specs/2026-08-10-ci-efficiency-design.md docs/superpowers/plans/2026-08-10-ci-efficiency.md
git commit -m "ci: reduce redundant verification work"
git push origin main
```
