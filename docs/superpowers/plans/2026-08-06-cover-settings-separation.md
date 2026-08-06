# Cover Settings Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put all cover management in the left settings rail while keeping the right media panel exclusively responsible for body images.

**Architecture:** Extract cover intake and crop state from `MediaPanel` into a focused `CoverPanel`. Compose `CoverPanel` under metadata in `#panel-settings`; keep `MediaPanel` in `#panel-actions` with only body-image behavior and filter each panel’s displayed asset by kind.

**Tech Stack:** React 19, TypeScript 6, Testing Library, Vitest, Playwright, CSS

## Global Constraints

- Preserve article data, front matter, ZIP formats, preview rendering, and vendored IMX theme files.
- Preserve JPEG/PNG/WebP cover validation, the 25 MiB limit, WebP crop output, draft-transition guards, and shared intake-busy reporting.
- Preserve body drag/drop, paste, batch intake, Markdown insertion, and reference-aware removal.
- Desktop left settings contain metadata then cover; mobile “设置” exposes the same responsibility split.

---

### Task 1: Extract Cover Management and Recompose the Workspace

**Files:**
- Create: `src/media/CoverPanel.tsx`
- Modify: `src/media/MediaPanel.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Modify: `tests/components/Workspace.test.tsx`
- Create: `tests/components/CoverPanel.test.tsx`
- Modify: `tests/components/MediaPanel.test.tsx`

**Interfaces:**
- Produces: `CoverPanel({ draftId, cover, disabled, onReplace, onRemove, onIntakeBusyChange })`
- Changes: `MediaPanel` displays and manages only assets with `kind === 'body'`
- Preserves: existing `MediaPanel` body-media callback signatures

- [ ] **Step 1: Write the failing workspace placement test**

Change the existing placement test to assert:

```ts
expect(within(settings).getByRole('heading', { name: '文章封面' })).toBeInTheDocument()
expect(within(settings).getByLabelText('选择封面')).toBeInTheDocument()
expect(within(tools).queryByLabelText('选择封面')).not.toBeInTheDocument()
expect(within(tools).getByLabelText('添加正文图片')).toBeInTheDocument()
```

- [ ] **Step 2: Run the placement test and verify RED**

Run: `npm test -- tests/components/Workspace.test.tsx`

Expected: FAIL because “选择封面” remains inside the right `MediaPanel`.

- [ ] **Step 3: Write focused failing cover ownership tests**

Create `CoverPanel.test.tsx` to render one cover and one body asset and assert only the cover is listed, the select control accepts JPEG/PNG/WebP, and removing the cover calls `onRemove(cover.id)`. Update `MediaPanel.test.tsx` to assert the same mixed asset input lists only the body asset and no longer exposes “选择封面”.

- [ ] **Step 4: Implement `CoverPanel`**

Move `COVER_TYPES`, `prevalidateCover`, pending-cover state, stale-draft generation checks, active-intake accounting, cover error reporting, `CoverCropDialog`, and the cover remove control into `CoverPanel.tsx`. Render:

```tsx
<section className="cover-panel" aria-label="文章封面">
  <h2>文章封面</h2>
  <label className="file-button">选择封面<input aria-label="选择封面" ... /></label>
  {cover ? <div className="cover-item" aria-label="当前封面">...</div> : null}
  {pendingCover ? <CoverCropDialog ... /> : null}
</section>
```

- [ ] **Step 5: Restrict `MediaPanel` to body images**

Remove cover imports, state, validation, input, and crop dialog from `MediaPanel`. Derive `const bodyMedia = media.filter((asset) => asset.kind === 'body')`, use it for name tracking, reference validation, and the rendered list, while retaining body-image queue and removal behavior.

- [ ] **Step 6: Compose panels in their responsible rails**

In `App.tsx`, render `CoverPanel` after `MetadataPanel` inside `#panel-settings`, passing `draft.media.find((asset) => asset.kind === 'cover')`. Keep `MediaPanel` in `#panel-actions`; remove cover-specific props from it. Both panels report to the existing intake-busy callback.

- [ ] **Step 7: Add minimal layout styling**

Give `.cover-panel` the same section rhythm and divider treatment used by settings/media cards, keep its controls vertical in the narrow left rail, and do not change the workspace grid or responsive tab behavior.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm test -- tests/components/Workspace.test.tsx tests/components/CoverPanel.test.tsx tests/components/MediaPanel.test.tsx tests/components/transition-recovery.test.tsx`

Expected: all tests PASS, including stale cover intake and busy-state behavior.

- [ ] **Step 9: Commit the component split**

```bash
git add src/media/CoverPanel.tsx src/media/MediaPanel.tsx src/app/App.tsx src/app/app.css tests/components/Workspace.test.tsx tests/components/CoverPanel.test.tsx tests/components/MediaPanel.test.tsx tests/components/transition-recovery.test.tsx
git commit -m "feat: move cover management to settings"
```

---

### Task 2: Browser Placement and Full Regression

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Consumes: `#panel-settings`, `#panel-actions`, “选择封面”, and “添加正文图片” accessible contracts

- [ ] **Step 1: Extend desktop and mobile browser assertions**

Assert the cover input is inside `#panel-settings`, absent from `#panel-actions`, and the body upload is inside `#panel-actions`. At 390px, verify both are visible under “设置” and the action rail remains hidden under “写作”.

- [ ] **Step 2: Run focused browser coverage**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: all tests PASS with no horizontal overflow.

- [ ] **Step 3: Run the complete verification matrix**

Run: `npm test && npm run lint && npm run typecheck && npm run check:theme && npm run build && npm run test:e2e`

Expected: every command exits 0 with only configured browser-specific skips.

- [ ] **Step 4: Verify boundaries and commit**

Run: `git diff --check`

Run: `git diff --name-only HEAD -- src/theme/imx`

Expected: no whitespace errors and no vendored theme changes.

```bash
git add tests/e2e/dock-and-sidebar.spec.ts
git commit -m "test: cover media responsibility split"
```

- [ ] **Step 5: Merge and push**

Fast-forward the verified feature branch into `main`, push `main` to `origin`, and confirm `git ls-remote --heads origin main` matches local `HEAD`.
