# Responsive Import And Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent ZIP dialogs and article previews from being clipped or requiring horizontal page scrolling at intermediate viewport sizes.

**Architecture:** Escape workspace layout containment with a body-level dialog portal, then make preview geometry container-relative instead of window-derived. Protect both contracts with component and browser tests.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve dialog focus trapping and focus restoration.
- Preserve IMX theme assets and article rendering behavior.
- Do not modify `src/theme/imx`.
- Do not add dependencies.

---

### Task 1: Body-level dialogs

**Files:**
- Modify: `tests/components/AccessibleDialog.test.tsx`
- Modify: `src/app/AccessibleDialog.tsx`
- Modify: `src/app/app.css`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: existing `AccessibleDialogProps` and `DialogClose` context.
- Produces: the same public component contract, with `.modal-backdrop` attached directly to `document.body`.

- [ ] Add a component assertion that the backdrop parent is `document.body` and run it to observe failure.
- [ ] Add a constrained-viewport import test that asserts the backdrop fills the viewport and every dialog edge remains visible; run it to observe failure.
- [ ] Implement `createPortal` rendering and viewport-safe dialog CSS.
- [ ] Run the focused component and Playwright tests until green.

### Task 2: Container-responsive preview

**Files:**
- Modify: `tests/components/PreviewFrame.test.tsx`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/preview/preview-frame.css`

**Interfaces:**
- Consumes: `viewport: 'desktop' | 'mobile'` in `PreviewFrame`.
- Produces: iframe widths `min(1180px, 100%)` and `min(390px, 100%)`, with no outer horizontal overflow.

- [ ] Change component expectations and add intermediate viewport browser assertions; run them to observe failure.
- [ ] Replace window-derived fixed widths with container-relative CSS widths and hide preview-canvas horizontal overflow.
- [ ] Add the compact Dock breakpoint and verify all focused tests pass.

### Task 3: Integrate and publish

**Files:**
- Verify all modified production and test files.

- [ ] Run lint, typecheck, 223+ unit tests, build, theme verification, and all Playwright projects.
- [ ] Confirm `git diff --check`, confirm `src/theme/imx` is unchanged, and inspect the final diff.
- [ ] Commit the implementation, fast-forward merge to `main`, rerun verification on merged `main`, and push `main`.
