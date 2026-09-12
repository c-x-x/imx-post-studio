# Studio Standalone Preview Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IMX Post Studio fully independent from `hugo-theme-imx` while preserving its current visual identity and fixing Markdown emphasis plus preview title/body alignment.

**Architecture:** Rename the frozen preview assets into Studio-owned resources, remove provenance/synchronization machinery, and keep the existing iframe rendering pipeline. Regression tests exercise generated Markdown, actual browser font loading, inline typography, and layout geometry rather than checking source provenance.

**Tech Stack:** React 19, TypeScript 6, Vite 8, unified/remark/rehype, Vitest, Playwright, CSS, self-hosted WOFF2 fonts.

## Global Constraints

- Modify only `imx-post-studio`; do not modify `hugo-theme-imx`.
- Keep the `IMX Post Studio` name, current logo, and current IMX-style visual.
- Remove theme snapshot provenance, synchronization commands, version/commit/hash checks, and theme-parity promises.
- Keep Markdown, image, ZIP, draft, and local-storage security/data contracts unchanged.
- Preserve Inter and Noto Serif SC OFL texts and all legally required notices.
- Verify real Noto Serif SC 400 and 700 font faces in a browser; use explicit italic synthesis because the bundled family has no italic face.
- Title and body left edges may differ by at most 1px in every desktop TOC state.
- Do not push unless the user explicitly requests it.

---

### Task 1: Markdown emphasis and font behavior

**Files:**
- Modify: `tests/unit/markdown-preview.test.ts`
- Modify: `tests/e2e/visual.spec.ts`
- Rename: `src/theme/imx/imx-preview.css` → `src/preview/studio-preview.css`
- Rename: `public/imx/fonts/` → `public/studio/fonts/`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `renderMarkdown(markdown, resolveLocalImage): Promise<RenderedMarkdown>`.
- Produces: Studio-owned preview CSS imported by `App.tsx`; browser-visible `<strong>`, `<em>`, and `<del>` typography; loadable Noto Serif SC 400/700 faces.

- [ ] **Step 1: Add the failing Markdown structure test**

Add a focused test that renders `**粗体**、*斜体*、~~删除线~~` and independently expects `<strong>粗体</strong>`, `<em>斜体</em>`, and `<del>删除线</del>`.

- [ ] **Step 2: Run the Markdown test and record whether parser output already passes**

Run: `npm test -- tests/unit/markdown-preview.test.ts`

Expected: parser assertions pass, proving the defect is presentation rather than Markdown parsing. This characterization result is evidence for the CSS-level failing browser test.

- [ ] **Step 3: Add the failing browser typography assertions**

Extend the preview fixture with bold, italic, and strikethrough text. In `assertPreviewCaptureReady`, load both:

```ts
document.fonts.load('400 1em "IMX Noto Serif SC"', '正文')
document.fonts.load('700 1em "IMX Noto Serif SC"', '粗体')
```

Assert that both faces report `status === 'loaded'`, `<strong>` has weight `700`, `<em>` has style `italic`, and `<del>` has `line-through` decoration.

- [ ] **Step 4: Run the focused Playwright test and verify RED**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "light desktop article preview"`

Expected: FAIL because the current CSS forces `<em>` to `font-style: normal`; the font proof may also expose the optional 700 face load.

- [ ] **Step 5: Move assets into Studio-owned paths and implement minimal typography fixes**

Rename the CSS and font directory, update the `App.tsx` raw-CSS import and application font URLs, then change preview font declarations to `/studio/fonts/...` with `font-display: swap`. Keep real 700 files and set:

```css
.article-page .article-content {
  font-synthesis: style;
}

.article-page .article-content strong {
  font-weight: 700;
}

.article-page .article-content em {
  font-style: italic;
}

.article-page .article-content del {
  text-decoration-line: line-through;
}
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- tests/unit/markdown-preview.test.ts
npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "light desktop article preview"
```

Expected: both commands exit 0; browser proof reports Noto 400 and 700 loaded and all three inline styles visible.

- [ ] **Step 7: Commit**

```bash
git add src/app/App.tsx src/app/app.css src/preview/studio-preview.css public/studio/fonts tests/unit/markdown-preview.test.ts tests/e2e/visual.spec.ts
git add -u src/theme/imx public/imx
git commit -m "fix: restore preview emphasis typography"
```

### Task 2: Preview title/body alignment

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Rename: `src/preview/imx-preview-overrides.ts` → `src/preview/studio-preview-behavior.ts`
- Modify: `src/preview/build-preview-document.ts`

**Interfaces:**
- Consumes: generated `.article-header`, `.layout-with-sidebar`, and `.toc-toggle-input` markup.
- Produces: `studioPreviewBehaviorCss: string`; identical title/body content columns before and after desktop TOC collapse.

- [ ] **Step 1: Add a failing geometry regression test**

In the existing desktop directory interaction test, measure `.article-header` and `.article-content` with `getBoundingClientRect()` before and after checking the TOC checkbox. For each state assert:

```ts
expect(Math.abs(bounds.headerLeft - bounds.contentLeft)).toBeLessThanOrEqual(1)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "preview table of contents"`

Expected: FAIL after desktop TOC collapse because only `.layout-with-sidebar` becomes narrow.

- [ ] **Step 3: Rename the behavior CSS and make collapse selectors symmetric**

Export `studioPreviewBehaviorCss` and import it from `build-preview-document.ts`. Use one shared rule for both containers:

```css
.article-page:has(.toc-toggle-input:checked) .article-header,
.article-page:has(.toc-toggle-input:checked) .layout-with-sidebar {
  grid-template-columns: minmax(0, var(--article-measure));
  width: min(var(--article-measure), calc(100vw - 3rem));
  gap: 0;
}
```

- [ ] **Step 4: Verify GREEN across Chromium and WebKit**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium --project=webkit --grep "preview table of contents"`

Expected: both projects exit 0 and both geometry states remain within 1px.

- [ ] **Step 5: Commit**

```bash
git add src/preview/build-preview-document.ts src/preview/studio-preview-behavior.ts tests/e2e/dock-and-sidebar.spec.ts
git add -u src/preview/imx-preview-overrides.ts
git commit -m "fix: align preview title and article body"
```

### Task 3: Remove theme synchronization and provenance coupling

**Files:**
- Delete: `scripts/sync-imx-theme.mjs`
- Delete: `scripts/verify-theme-manifest.mjs`
- Delete: `tests/unit/theme-manifest.test.ts`
- Delete: `src/theme/imx/theme-manifest.json`
- Move: `src/theme/imx/OFL-Inter.txt` → `public/studio/fonts/OFL-Inter.txt`
- Move: `src/theme/imx/OFL-Noto-Serif-SC.txt` → `public/studio/fonts/OFL-Noto-Serif-SC.txt`
- Move: `src/theme/imx/LICENSE.imx` → `docs/licenses/IMX-PREVIEW-ORIGIN-MIT.txt`
- Create: `scripts/verify-standalone.mjs`
- Create: `tests/unit/standalone-verifier.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/release-verification.md`
- Rename: `src/app/imx-theme-parity.css` → `src/app/studio-surfaces.css`
- Modify: `src/app/app.css`
- Modify: `src/app/imx-dock.css`
- Modify: `src/app/use-shared-dock.ts`
- Modify: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Produces: `npm run check:standalone`, which exits nonzero when maintained runtime/config files reintroduce theme repository, snapshot, manifest, or sync coupling.

- [ ] **Step 1: Add a failing standalone verifier test**

Create a temporary fixture containing `package.json`, `.github/workflows/ci.yml`, `src/`, `scripts/`, `public/`, and `README.md`. Spawn the verifier with the fixture path, assert clean input exits 0, then add each forbidden contract (`hugo-theme-imx`, `sync:imx`, `check:theme`, `theme-manifest`, `src/theme/imx`, `/imx/fonts/`) and assert a nonzero exit with the offending relative path. Keep `IMX Post Studio`, `ImxDock`, and license/notice paths allowed.

- [ ] **Step 2: Run the verifier test and verify RED**

Run: `npm test -- tests/unit/standalone-verifier.test.ts`

Expected: FAIL because `scripts/verify-standalone.mjs` does not exist.

- [ ] **Step 3: Implement the verifier and remove coupling artifacts**

Implement a recursive UTF-8 scanner limited to the maintained scopes above, skipping binary extensions, `node_modules`, `.git`, `.worktrees`, build output, reports, and historical `docs/superpowers`. Replace package commands with `check:standalone`, replace the CI step, remove sync/manifest files, relocate licenses, rename Studio surface CSS, and remove source-commit comments.

- [ ] **Step 4: Update user and release documentation**

Describe Studio as an independent local-first Markdown editor with Studio-owned preview resources. Remove version/tag/commit/hash/sync instructions and theme-parity promises while retaining product-brand wording and third-party licensing details.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/standalone-verifier.test.ts tests/components/PreviewFrame.test.tsx
npm run check:standalone
```

Expected: both commands exit 0; no maintained production/config path depends on the theme repository or old asset locations.

- [ ] **Step 6: Commit**

```bash
git add package.json .github/workflows/ci.yml README.md docs src public scripts tests
git commit -m "refactor: make Studio preview independently maintained"
```

### Task 4: Full regression and repository boundary verification

**Files:**
- Modify only if verification exposes a regression in files already in scope.

**Interfaces:**
- Produces: a releasable feature branch with fresh unit, lint, type, build, standalone, and browser evidence.

- [ ] **Step 1: Run static and unit verification**

```bash
npm run lint
npm run typecheck
npm test
npm run check:standalone
npm run build
```

Expected: all commands exit 0 with no lint/type/test/build failures.

- [ ] **Step 2: Run full browser regression**

Run: `npm run test:e2e`

Expected: all configured Chromium, Firefox, and WebKit tests pass, including typography, directory, scrolling, responsive, security, and visual cases.

- [ ] **Step 3: Audit changed files and both repositories**

```bash
git diff --check
git status --short --branch
git diff main...HEAD --stat
git -C /Users/cb/Documents/Codex/test0/hugo-theme-imx status --short --branch
```

Expected: no whitespace errors; only intended Studio files are changed; `hugo-theme-imx` remains clean.

- [ ] **Step 4: Commit any verification-only adjustments**

If verification required changes inside the established scope, stage only those files and commit with `test: complete standalone preview regression coverage`. If no changes remain, do not create an empty commit.
