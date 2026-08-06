# IMX Theme Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Studio’s non-Dock interface and mobile layout use the same visual system as `hugo-theme-imx` while preserving Studio behavior.

**Architecture:** Add a Studio-local parity stylesheet mapped directly to the theme’s `tokens.css`, `base.css`, `cards.css`, `article.css`, and responsive CSS. Retain Studio layout and interaction selectors, but route their colors, typography, geometry, and motion through exact theme-equivalent tokens; leave the existing Dock implementation and comment-button behavior untouched.

**Tech Stack:** React 19, TypeScript 6, CSS, Vite, Vitest, Playwright

## Global Constraints

- `hugo-theme-imx/assets/css/` is the visual source of truth; no file under `src/theme/imx` or the Hugo theme source is modified.
- Preserve all Studio accessible names, keyboard behavior, autosave, import/export, cover crop, media intake, preview sandbox, draft transitions, and comment-button behavior.
- Preserve the current shared Dock merge implementation and Dock interactions on desktop and mobile.
- Desktop and mobile light/dark styles must resolve from the theme-equivalent token layer.

---

### Task 1: Introduce Theme-Equivalent Studio Tokens and Primitives

**Files:**
- Create: `src/app/imx-theme-parity.css`
- Modify: `src/app/app.css`
- Modify: `tests/e2e/visual.spec.ts`

**Interfaces:**
- Produces: theme-aligned `--imx-*` semantic tokens for Studio components
- Consumes: literal values from `hugo-theme-imx/assets/css/tokens.css`
- Preserves: existing Studio selector names and DOM structure

- [ ] **Step 1: Write failing computed-style assertions**

Add a visual-shell assertion that checks the Studio page background, interface font family, primary control border radius, card border color, and dark-mode text color against the relevant theme tokens.

- [ ] **Step 2: Run the visual-shell test and verify RED**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "theme parity"`

Expected: FAIL because Studio uses approximate local values and does not expose an explicit parity layer.

- [ ] **Step 3: Create the parity stylesheet**

Copy the semantic light/dark token values from theme `tokens.css` into Studio names, including `--color-bg`, `--color-bg-secondary`, `--color-bg-card`, `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-border`, `--color-shadow`, primary shades, code colors, gradients, and theme font stacks. Map Studio variables to those tokens instead of re-declaring divergent literals.

- [ ] **Step 4: Normalize global Studio primitives**

Update `app.css` so body, selection, scrollbars, headings, paragraphs, controls, code blocks, borders, shadows, and focus states derive from the parity layer. Do not alter `.imx-dock`, `.preview-dock`, or their shared-Dock styles.

- [ ] **Step 5: Run the shell assertions and snapshot baseline**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "theme parity|application shell"`

Expected: PASS with no visual baseline update outside deliberately changed Studio-shell captures.

- [ ] **Step 6: Commit token parity**

```bash
git add src/app/imx-theme-parity.css src/app/app.css tests/e2e/visual.spec.ts
git commit -m "style: align Studio primitives with IMX theme"
```

---

### Task 2: Align Home, Workspace, Drafts, and Dialog Surfaces

**Files:**
- Modify: `src/app/app.css`
- Modify: `src/preview/preview-frame.css`
- Modify: `tests/e2e/visual.spec.ts`
- Update: `tests/e2e/visual.spec.ts-snapshots/` only for changed Studio-shell captures

**Interfaces:**
- Consumes: parity token layer from Task 1
- Preserves: editor rails, mobile tabs, dialogs, preview iframe, and all behavior selectors

- [ ] **Step 1: Write failing desktop/mobile shell assertions**

Assert that home cards, draft entries, workspace rails, editor, media/cover sections, dialogs, and mobile settings use the parity layer’s background, border, radius, and typography values; assert Dock classes remain unchanged.

- [ ] **Step 2: Run the focused visual test and verify RED**

Run: `npx playwright test tests/e2e/visual.spec.ts tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "theme parity|compact IMX menu"`

Expected: FAIL where a non-Dock Studio surface still has an approximate visual value.

- [ ] **Step 3: Apply component-surface parity styles**

Use theme card, post-card, article, and responsive rules as the exact reference for card radii, borders, background alpha, hover elevation, editorial heading rhythm, controls, inputs, code editor chrome, list rows, dialogs, notices, and mobile stacked spacing. Keep Studio-only grid positioning and action semantics.

- [ ] **Step 4: Align preview shell without changing preview document behavior**

Map only `preview-frame.css` shell colors and controls to the parity tokens. Keep `buildPreviewDocument`, iframe sandbox, Dock merge hook, and article override order unchanged.

- [ ] **Step 5: Update and inspect only required Studio shell snapshots**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --update-snapshots`

Inspect light/dark desktop and mobile Studio shell captures. Confirm the Dock remains interactive/merged where its existing tests require it and all non-Dock surfaces use theme geometry.

- [ ] **Step 6: Run focused regression coverage**

Run: `npm test -- tests/components/Workspace.test.tsx tests/components/PreviewFrame.test.tsx tests/components/CoverPanel.test.tsx`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts tests/e2e/editor.spec.ts --project=chromium`

Expected: all commands PASS.

- [ ] **Step 7: Commit surface alignment**

```bash
git add src/app/app.css src/preview/preview-frame.css tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "style: align Studio surfaces with IMX theme"
```

---

### Task 3: Complete Verification, Merge, and Push

**Files:**
- Verify only

- [ ] **Step 1: Run the complete matrix**

Run: `npm test && npm run lint && npm run typecheck && npm run check:theme && npm run build && npm run test:e2e`

Expected: every command exits 0 with only configured browser-specific skips.

- [ ] **Step 2: Verify source boundaries**

Run: `git diff --check`

Run: `git diff --name-only HEAD -- src/theme/imx`

Expected: no whitespace errors and no vendored theme changes.

- [ ] **Step 3: Merge and push the verified result**

Fast-forward the feature branch into `main`, push `main` to `origin`, confirm remote `main` equals local `HEAD`, and remove the temporary worktree and feature branch.
