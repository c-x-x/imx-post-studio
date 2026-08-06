# Preview Theme Parity and CI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make preview light/dark surfaces match IMX exactly and restore a green GitHub Actions run.

**Architecture:** Keep the bundled IMX CSS as the sole article palette. Limit preview overrides to iframe behavior and layout, then update accessibility and visual regression expectations to the approved appearance.

**Tech Stack:** React, TypeScript, CSS, Playwright, axe-core, GitHub Actions.

## Global Constraints

- Do not modify `/Users/cb/Documents/Codex/test0/hugo-theme-imx`.
- Preserve preview scroll position, active directory following, and hidden scrollbars.
- Use IMX light `#fbfaf7` and dark `#171716` page backgrounds.
- Merge and push only after full local verification.

---

### Task 1: Lock IMX preview colors with a failing regression

**Files:**
- Modify: `tests/e2e/visual.spec.ts`

**Interfaces:**
- Consumes: rendered preview iframe created by `PreviewFrame`.
- Produces: computed-style assertions for the IMX dark palette.

- [ ] Change the dark preview assertions to expect body `rgb(23, 23, 22)`, article text `rgb(238, 234, 227)`, metadata `rgb(143, 137, 130)`, and inactive TOC text `rgb(143, 137, 130)` with opacity `0.58`.
- [ ] Run `npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "dark desktop"` and confirm it fails on the old custom palette.

### Task 2: Remove the duplicate preview palette

**Files:**
- Modify: `src/preview/imx-preview-overrides.ts`

**Interfaces:**
- Consumes: IMX variables from `src/theme/imx/imx-preview.css`.
- Produces: uniform iframe background without redefining article colors.

- [ ] Set the dark `--preview-page-bg` to `#171716` and remove preview-only overrides for article ink, accent, card, soft background, blockquote, and code colors.
- [ ] Run the focused dark-preview test and confirm the computed-style assertions pass; leave screenshot updates for Task 4.

### Task 3: Repair the accessibility failure

**Files:**
- Modify: `src/app/app.css`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: IMX application color variables.
- Produces: readable small cover help text.

- [ ] Add an assertion that `.cover-help` computes to `rgb(95, 88, 80)` and run the focused axe test to confirm failure.
- [ ] Change `.cover-help` from `--imx-ink-muted` to `--imx-ink-secondary`.
- [ ] Re-run the focused axe test in Chromium, Firefox, and WebKit and confirm zero serious or critical violations.

### Task 4: Update intentional visual baselines

**Files:**
- Modify: `tests/e2e/visual.spec.ts-snapshots/*.png`

**Interfaces:**
- Consumes: approved IMX preview appearance.
- Produces: platform-specific screenshot baselines.

- [ ] Run `npx playwright test tests/e2e/visual.spec.ts --project=chromium --update-snapshots` on macOS.
- [ ] Generate Linux Chromium baselines with the repository Playwright container/runtime used by CI.
- [ ] Run the visual suite without update mode and confirm all six Chromium tests pass.

### Task 5: Verify, integrate, and confirm CI

**Files:**
- Verify all changed files; no new production interface.

- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:theme`, `npm run build`, and `npm run test:e2e`.
- [ ] Run `git diff --check`, confirm the theme snapshot was not modified, and inspect the final diff.
- [ ] Commit on the isolated branch, fast-forward `main`, rerun `npm test`, and push `main`.
- [ ] Verify the production page colors and the previous scroll/TOC/scrollbar regression.
- [ ] Inspect the new GitHub Actions run and require a successful conclusion before completion.
