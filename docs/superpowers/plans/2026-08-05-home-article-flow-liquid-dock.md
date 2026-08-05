# Studio Home, Article Flow, and Liquid Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a useful default home page, make “文章” navigation non-destructive, expose explicit article actions, port the IMX liquid menu indicator, and remove the opaque bridge during Dock fusion.

**Architecture:** Extend the existing in-memory view state to `home | workspace | dashboard`, keep one current article session, and gate IndexedDB autosave behind a `draftStarted` flag. Isolate homepage rendering, article actions, and liquid-indicator physics in focused modules while preserving the current exporter, preview, media, and recovery contracts.

**Tech Stack:** React 19, TypeScript, CSS, Vitest/Testing Library, Playwright, IndexedDB repository, Vite.

## Global Constraints

- Do not modify `hugo-theme-imx` or `c-x-x.github.io`; they are read-only references.
- Do not add a router, backend, authentication, cloud storage, or new persistence format.
- Keep autosave, safe transition recovery, ZIP export/import, media processing, and sandboxed preview behavior.
- Adapt liquid-indicator behavior from read-only `hugo-theme-imx` commit `6f08e8e`.
- Use `c-x-x <83284956+c-x-x@users.noreply.github.com>` for commits.
- Do not push until explicitly requested.

---

### Task 1: Default home page and non-destructive navigation

**Files:**
- Create: `src/home/HomePage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/app/app.css`
- Test: `tests/components/App.test.tsx`
- Test: `tests/components/ImxDock.test.tsx`

**Interfaces:**
- `HomePageProps`: `{ disabled: boolean; onArticle: () => void; onDashboard: () => void }`.
- `View`: `'home' | 'workspace' | 'dashboard'`.
- `ImxDockProps`: replace `onNew` with `onHome` and `onArticle`; retain `onDashboard`, `onPreview`, and `previewTrigger`.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<App />)
expect(screen.getByRole('region', { name: 'IMX Post Studio 介绍' })).toBeVisible()
expect(screen.getByRole('heading', { name: '为 IMX 写作，也只在本地处理' })).toBeVisible()
expect(screen.getByRole('heading', { name: 'Markdown 语法速查' })).toBeVisible()
await user.click(screen.getByRole('button', { name: '文章' }))
await user.click(screen.getByRole('button', { name: '文章' }))
expect(screen.getByRole('region', { name: '文章工作区' })).toBeVisible()
```

Assert the Dock exposes `首页`, `文章`, and `草稿库`, and moves `aria-current="page"` without calling a creation callback.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/components/App.test.tsx tests/components/ImxDock.test.tsx`

Expected: failures for missing homepage, missing navigation labels, and old `onNew` contract.

- [ ] **Step 3: Implement the home page and view transitions**

Create `HomePage` with project introduction, local-only privacy statement, three-step workflow, and static examples for headings, emphasis, lists, links, images, quotes, fenced code, and tables. Change the initial view to `home`; implement `showHome` and `showWorkspace`; ensure both only navigate and never dispatch the reducer’s `new` action.

- [ ] **Step 4: Style home content with existing IMX tokens**

Use the existing paper background, reading font, rounded cards, subtle dividers, and responsive grids. Code examples use `<pre><code>` with wrapping/overflow protection; the mobile layout must remain single-column.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run tests/components/App.test.tsx tests/components/ImxDock.test.tsx`

Commit: `feat: add Studio home and article navigation`

---

### Task 2: Explicit article actions and persistence eligibility

**Files:**
- Create: `src/app/ArticleActions.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Modify: `src/drafts/use-autosave.ts` only if its public contract needs a clarifying name; otherwise pass `null` until persistence is eligible.
- Test: `tests/components/Workspace.test.tsx`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- `ArticleActionsProps`: `{ disabled: boolean; onNew: () => void; onSave: () => void }`.
- `draftStarted: boolean`: false for untouched in-memory blank drafts; true after editing, opening, importing, or explicit save.
- `saveCurrentDraft(): Promise<void>`: writes `draftRef.current`, marks the session started, and announces success without leaving the workspace.

- [ ] **Step 1: Write failing persistence-flow tests**

```tsx
await user.click(screen.getByRole('button', { name: '文章' }))
expect(screen.getByRole('button', { name: '新建文章' })).toBeVisible()
expect(screen.getByRole('button', { name: '保存到草稿库' })).toBeVisible()
await user.click(screen.getByRole('button', { name: '首页' }))
expect(await draftRepository.list()).toHaveLength(0)
```

Add tests proving repeated “文章” navigation retains entered text, explicit save creates one draft, and explicit new creates one new identity only after the action is pressed.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/components/Workspace.test.tsx`

Expected: missing article actions and blank navigation currently persisting a draft.

- [ ] **Step 3: Implement the session-started gate**

Initialize `draftStarted` as false. Mark it true in user mutation paths, `openDraft`, `replaceImportedDraft`, and `openImportedAsNew`. Pass `draft` to `useAutosave` only when `view === 'workspace' && draftStarted`. Update `requestTransition` so it skips repository writes for untouched blank sessions.

- [ ] **Step 4: Implement explicit save and new actions**

`saveCurrentDraft` calls `draftRepository.put(draftRef.current)`, keeps the workspace visible, sets `draftStarted` true, and reports `已保存到草稿库`. `startNew` uses the safe transition gate, resets the reducer to `createArticleDraft()`, sets `draftStarted` false, selects the settings tab, and reports `已创建新文章`.

- [ ] **Step 5: Run focused unit and Chromium workflow tests**

Run: `npx vitest run tests/components/Workspace.test.tsx tests/components/App.test.tsx`

Run: `npx playwright test tests/e2e/editor.spec.ts --project=chromium`

- [ ] **Step 6: Commit**

Commit: `feat: add explicit article draft actions`

---

### Task 3: Real IMX liquid navigation indicator

**Files:**
- Create: `src/app/use-liquid-indicator.ts`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/app/imx-dock.css`
- Test: `tests/unit/liquid-indicator.test.ts`
- Test: `tests/components/ImxDock.test.tsx`
- Test: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- `useLiquidIndicator(menuRef: RefObject<HTMLElement | null>, activeView: 'home' | 'workspace' | 'dashboard'): void`.
- Menu buttons carry `data-dock-view="home|workspace|dashboard"`.
- The hook writes `--indicator-x`, `--indicator-width`, `--indicator-scale-x`, `--indicator-scale-y`, `--indicator-skew`, `--indicator-edge-opacity`, and `--indicator-opacity` to the menu element.

- [ ] **Step 1: Write failing physics and component tests**

Test a pure exported spring step or interpolation helper for finite convergence. Render the Dock with mocked menu/button bounds and assert the active view produces non-zero indicator width. Change the view and assert the target CSS variables move to the new item.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/unit/liquid-indicator.test.ts tests/components/ImxDock.test.tsx`

Expected: missing hook/helper and indicator variables.

- [ ] **Step 3: Port scoped indicator physics**

Adapt the theme’s measurement, pointer interpolation, spring advance, lift, stretch, resize observation, reduced-motion, and cleanup behavior. Query only `[data-dock-view]` buttons beneath the supplied menu ref; never use a document-global `.navbar-menu` selector.

- [ ] **Step 4: Port the liquid surface CSS**

Add the theme-equivalent pseudo-element variables, highlight surface, border, rainbow edge, lift state, and stacking order under `.imx-dock__menu`. Remove the desktop active button fill so the indicator is visible; restore a simple active fill inside the mobile media query where physics is disabled.

- [ ] **Step 5: Add browser interaction coverage**

In Chromium, assert the resting indicator aligns with `首页`, pointer movement changes `--indicator-x`, pointer leave returns it to the current `文章` item, and reduced motion resolves immediately.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx vitest run tests/unit/liquid-indicator.test.ts tests/components/ImxDock.test.tsx`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Commit: `feat: add IMX liquid Dock indicator`

---

### Task 4: Transparent, staged Dock fusion

**Files:**
- Modify: `src/app/use-shared-dock.ts`
- Modify: `src/app/imx-dock.css`
- Modify: `tests/unit/shared-dock.test.ts`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Preserve `smoothStep(edge0, edge1, value): number`.
- Export `dockSurfaceState(attraction: number)` returning `{ partPresence: number; shellPresence: number; shellOpacity: number }` for deterministic tests.

- [ ] **Step 1: Write a failing mid-fusion regression test**

```ts
const middle = dockSurfaceState(0.5)
expect(middle.partPresence).toBeGreaterThan(0.85)
expect(middle.shellOpacity).toBeLessThan(0.2)
expect(dockSurfaceState(1).shellOpacity).toBe(1)
```

Add an E2E assertion at approximately half-scroll that the shell is still lightly transparent while the three parts retain their own surfaces, then assert one complete shell at full merge.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/unit/shared-dock.test.ts`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "Dock"`

- [ ] **Step 3: Implement staged crossfade and real glass**

Delay shell presence until attraction `0.42`, reach full shell presence at `0.92`, and keep part presence high until attraction `0.5` before fading by `0.98`. Give shell and separated parts a low-alpha surface with `backdrop-filter: blur(18px) saturate(150%)`; preserve the final merged geometry and mobile reset.

- [ ] **Step 4: Run focused tests and commit**

Run: `npx vitest run tests/unit/shared-dock.test.ts`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Commit: `fix: smooth transparent Dock fusion`

---

### Task 5: Responsive visual and full regression verification

**Files:**
- Modify: `tests/e2e/visual.spec.ts`
- Modify: `docs/release-verification.md`

**Interfaces:**
- No new runtime interfaces.

- [ ] **Step 1: Extend visual shell assertions**

Assert the application loads on the homepage, the desktop Dock has three menu items and an initialized indicator, and the mobile home/article layouts have no horizontal overflow. Retain existing approved article-preview baselines unchanged.

- [ ] **Step 2: Capture temporary visual evidence**

Capture and inspect desktop homepage, mobile homepage, desktop article actions, indicator hover, half-fused Dock, and fully merged Dock. Store temporary screenshots under `/tmp`, not in the repository.

- [ ] **Step 3: Run the complete release gate**

Run each command and require exit code zero:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run check:theme
npm run test:e2e
git diff --check
```

- [ ] **Step 4: Record verification and confirm read-only repositories**

Update `docs/release-verification.md` with test counts and the theme source commit. Verify `git status --short` is empty in both `hugo-theme-imx` and `c-x-x.github.io`.

- [ ] **Step 5: Commit the verification record**

Commit: `test: verify Studio home and liquid Dock`

- [ ] **Step 6: Present integration options**

Do not push automatically. Report the branch, commits, test evidence, and existing non-blocking Vite chunk warning, then offer local merge, PR, or keeping the branch.
