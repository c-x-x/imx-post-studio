# Dark Preview and Action Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a readable, seamless IMX preview with a theme-synchronized liquid Dock and a default-expanded, collapsible desktop action rail.

**Architecture:** Keep `App` as the only theme owner, make `PreviewFrame` controlled, and append Studio-owned preview CSS after the immutable vendored theme snapshot. Extend the existing three-column workspace into a symmetric five-column desktop layout and persist the new action-rail state through a focused preference module.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest, Testing Library, Playwright, Vite

## Global Constraints

- Do not modify `src/theme/imx/imx-preview.css` or `src/theme/imx/theme-manifest.json`.
- Do not change draft data, Markdown/front matter, ZIP import/export, recovery, or new-article confirmation behavior.
- Dark preview uses background `#151513`, primary `#f5f0e8`, body `#e3dcd2`, secondary `#d8d0c5`, metadata `#b7aea2`, TOC `#c8bfb3`, accent `#d8b98a`, quote `#22211e`, and code `#201f1c`.
- Desktop action rail is expanded by default and persists independently from the left settings rail.
- Mobile keeps visible horizontal article actions and hides both desktop rail toggles.
- Preview shell, viewport, and iframe document use one seamless theme background.
- Preview Dock must remain keyboard accessible and respect reduced motion.

---

## File Structure

- Create `src/app/action-rail-preference.ts`: storage key and read/write functions for the right rail only.
- Create `tests/unit/action-rail-preference.test.ts`: default, malformed-value, and persistence coverage.
- Modify `src/app/App.tsx`: own right-rail state, place actions inside the grid, expose state attributes, and control preview theme.
- Modify `src/app/ArticleActions.tsx`: add the right-rail landmark identity without changing button behavior.
- Modify `src/app/app.css`: five-column desktop workspace, symmetric toggles, collapsed states, and mobile fallback.
- Modify `tests/components/Workspace.test.tsx`: right-rail default, focus, independence, and persistence coverage.
- Modify `src/preview/PreviewFrame.tsx`: controlled theme interface and grouped Dock markup.
- Modify `tests/components/PreviewFrame.test.tsx`: controlled-theme and callback coverage.
- Create `src/preview/imx-preview-overrides.css`: Studio-owned article contrast and seamless-document overrides.
- Modify `src/preview/build-preview-document.ts`: inject the override CSS after the vendored CSS.
- Modify `src/preview/preview-frame.css`: adaptive liquid Dock, seamless surface, responsive layout, and reduced motion.
- Modify `tests/e2e/dock-and-sidebar.spec.ts`: right-rail layout/persistence, mobile visibility, and preview/global theme synchronization.
- Modify `tests/e2e/visual.spec.ts`: explicit preview color assertions and approved screenshot flow.
- Update `tests/e2e/visual.spec.ts-snapshots/imx-preview-*.png`: reviewed Chromium light/dark desktop/mobile baselines for macOS and CI Linux where produced.

---

### Task 1: Persistent Symmetric Right Action Rail

**Files:**
- Create: `src/app/action-rail-preference.ts`
- Create: `tests/unit/action-rail-preference.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ArticleActions.tsx`
- Modify: `src/app/app.css`
- Modify: `tests/components/Workspace.test.tsx`

**Interfaces:**
- Produces: `readActionsCollapsed(storage?: Pick<Storage, 'getItem'>): boolean`
- Produces: `writeActionsCollapsed(collapsed: boolean, storage?: Pick<Storage, 'setItem'>): void`
- Produces: workspace attribute `data-actions-collapsed="true|false"`
- Produces: toggle accessible names `折叠文章操作` and `展开文章操作`

- [ ] **Step 1: Write failing preference tests**

Create `tests/unit/action-rail-preference.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readActionsCollapsed, writeActionsCollapsed } from '../../src/app/action-rail-preference'

describe('action rail preference', () => {
  it('defaults to expanded and accepts only an explicit collapsed value', () => {
    expect(readActionsCollapsed({ getItem: () => null })).toBe(false)
    expect(readActionsCollapsed({ getItem: () => 'broken' })).toBe(false)
    expect(readActionsCollapsed({ getItem: () => 'true' })).toBe(true)
  })

  it('writes a stable boolean string', () => {
    let stored = ''
    writeActionsCollapsed(true, { setItem: (_key, value) => { stored = value } })
    expect(stored).toBe('true')
  })
})
```

- [ ] **Step 2: Run the preference test and verify failure**

Run: `npm test -- tests/unit/action-rail-preference.test.ts`

Expected: FAIL because `src/app/action-rail-preference.ts` does not exist.

- [ ] **Step 3: Implement the preference module**

Create `src/app/action-rail-preference.ts`:

```ts
const ACTIONS_COLLAPSED_KEY = 'imx-post-studio:actions-collapsed'

export function readActionsCollapsed(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(ACTIONS_COLLAPSED_KEY) === 'true'
}

export function writeActionsCollapsed(
  collapsed: boolean,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(ACTIONS_COLLAPSED_KEY, String(collapsed))
}
```

- [ ] **Step 4: Extend the workspace component test before changing layout**

Add a test to `tests/components/Workspace.test.tsx` that enters the article view, asserts `data-actions-collapsed="false"`, clicks `折叠文章操作`, verifies `aria-expanded="false"` and focus, confirms the left rail remains expanded, remounts, and verifies the right rail restores collapsed. Add `localStorage.removeItem('imx-post-studio:actions-collapsed')` to cleanup.

```ts
it('collapses and restores the desktop action rail independently', async () => {
  const user = userEvent.setup()
  const first = render(<App />)
  await user.click(screen.getByRole('button', { name: '文章' }))
  const workspace = screen.getByRole('region', { name: '文章工作区' })

  expect(workspace).toHaveAttribute('data-actions-collapsed', 'false')
  await user.click(screen.getByRole('button', { name: '折叠文章操作' }))
  expect(workspace).toHaveAttribute('data-actions-collapsed', 'true')
  expect(workspace).toHaveAttribute('data-inspector-collapsed', 'false')
  expect(screen.getByRole('button', { name: '展开文章操作' })).toHaveFocus()

  first.unmount()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '文章' }))
  expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-actions-collapsed', 'true')
})
```

- [ ] **Step 5: Run the workspace test and verify failure**

Run: `npm test -- tests/components/Workspace.test.tsx tests/unit/action-rail-preference.test.ts`

Expected: preference tests PASS; workspace test FAIL because the right toggle and state attribute do not exist.

- [ ] **Step 6: Implement the right rail and symmetric grid**

In `App.tsx`, initialize `actionsCollapsed` from `readActionsCollapsed`, add a focus-preserving `toggleActions` parallel to `toggleSettings`, put `ArticleActions` after the editor inside `.workspace-grid`, and add a button before it:

```tsx
<button
  className="actions-toggle"
  type="button"
  aria-controls="panel-actions"
  aria-expanded={!actionsCollapsed}
  aria-label={actionsCollapsed ? '展开文章操作' : '折叠文章操作'}
  title={actionsCollapsed ? '展开文章操作' : '折叠文章操作'}
  onClick={toggleActions}
><span aria-hidden="true">{actionsCollapsed ? '‹' : '›'}</span></button>
<ArticleActions disabled={workspaceLocked} onNew={() => void startNew()} onSave={() => void saveCurrentDraft()} />
```

Give `ArticleActions` `id="panel-actions"` and `className="workspace-actions article-actions"`. Set both workspace data attributes. In `app.css`, use five desktop columns, collapse the fifth column to `0fr` when needed, hide overflow in `.workspace-actions`, stack its buttons vertically, and mirror `.inspector-toggle` styles for `.actions-toggle`. At `max-width: 720px`, hide `.actions-toggle`, make `.workspace-actions` visible above the active panel with a horizontal button row, and do not honor desktop collapsed visibility.

- [ ] **Step 7: Run focused tests and lint**

Run: `npm test -- tests/unit/action-rail-preference.test.ts tests/components/Workspace.test.tsx`

Run: `npm run lint`

Expected: all focused tests PASS and ESLint exits 0.

- [ ] **Step 8: Commit the rail**

```bash
git add src/app/action-rail-preference.ts src/app/App.tsx src/app/ArticleActions.tsx src/app/app.css tests/unit/action-rail-preference.test.ts tests/components/Workspace.test.tsx
git commit -m "feat: add collapsible article action rail"
```

---

### Task 2: Make Preview Theme Globally Controlled

**Files:**
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/app/App.tsx`
- Modify: `tests/components/PreviewFrame.test.tsx`
- Modify: `tests/components/Workspace.test.tsx`

**Interfaces:**
- Consumes: `AppTheme` from `src/app/theme-preference.ts`
- Produces: `PreviewFrameProps.theme: AppTheme`
- Produces: `PreviewFrameProps.onThemeChange: (theme: AppTheme) => void`

- [ ] **Step 1: Write the failing controlled-theme component test**

Update the existing `PreviewFrame` renders to pass `theme="dark"` and `onThemeChange={onThemeChange}`. Add assertions:

```ts
const onThemeChange = vi.fn()
render(<PreviewFrame {...props} theme="dark" onThemeChange={onThemeChange} />)
expect(screen.getByRole('button', { name: '深色预览' })).toHaveAttribute('aria-pressed', 'true')
expect(screen.getByTitle('IMX 文章预览').getAttribute('srcdoc')).toContain('data-theme="dark"')
fireEvent.click(screen.getByRole('button', { name: '浅色预览' }))
expect(onThemeChange).toHaveBeenCalledWith('light')
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- tests/components/PreviewFrame.test.tsx`

Expected: FAIL because `PreviewFrame` does not accept controlled theme props and still initializes light locally.

- [ ] **Step 3: Convert `PreviewFrame` to controlled theme**

Import `AppTheme`, extend the props, remove local theme state, and replace theme button setters:

```ts
interface PreviewFrameProps {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
  onClose: () => void
}
```

Use `onThemeChange('light')` and `onThemeChange('dark')`; keep viewport state local.

- [ ] **Step 4: Wire a single persisted theme setter in `App`**

Replace direct toggle-only persistence with:

```ts
const changeTheme = (next: AppTheme) => {
  setTheme(next)
  applyTheme(next)
  writeThemePreference(next)
}
const toggleTheme = () => changeTheme(theme === 'dark' ? 'light' : 'dark')
```

Pass `theme={theme}` and `onThemeChange={changeTheme}` to `PreviewFrame`.

- [ ] **Step 5: Add App integration assertions**

In `Workspace.test.tsx`, set `document.documentElement.dataset.theme = 'dark'` through the existing preference API or local storage before rendering, open preview, click `浅色预览`, and assert both `document.documentElement.dataset.theme === 'light'` and iframe `srcdoc` contains `data-theme="light"`.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- tests/components/PreviewFrame.test.tsx tests/components/Workspace.test.tsx tests/unit/theme-preference.test.ts`

Run: `npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 7: Commit synchronization**

```bash
git add src/app/App.tsx src/preview/PreviewFrame.tsx tests/components/PreviewFrame.test.tsx tests/components/Workspace.test.tsx
git commit -m "feat: synchronize preview and app theme"
```

---

### Task 3: Seamless Preview Palette and Liquid Dock

**Files:**
- Create: `src/preview/imx-preview-overrides.css`
- Modify: `src/preview/build-preview-document.ts`
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/preview/preview-frame.css`
- Modify: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Produces: imported raw string `previewOverridesCss`
- Produces: preview root attributes `data-theme` and `data-viewport`
- Preserves: sandbox `allow-same-origin` without `allow-scripts`

- [ ] **Step 1: Write failing document-contract assertions**

Extend the document test to build a dark preview and assert the final style contains the approved tokens and removes TOC opacity:

```ts
expect(document).toContain('--article-page-bg: #151513')
expect(document).toContain('--article-ink: #e3dcd2')
expect(document).toContain('--article-ink-muted: #b7aea2')
expect(document).toContain('.article-page .toc a')
expect(document).toContain('opacity: 1')
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- tests/components/PreviewFrame.test.tsx`

Expected: FAIL because the Studio preview override stylesheet is not injected.

- [ ] **Step 3: Create and inject the Studio-owned overrides**

Create `imx-preview-overrides.css` with light/dark document background variables, approved dark article variables, explicit body/article background inheritance, readable metadata, `opacity: 1` for TOC anchors, warm quote/code surfaces, and no article card border/radius/shadow. Import it in `build-preview-document.ts` using Vite raw import:

```ts
import previewOverridesCss from './imx-preview-overrides.css?raw'
```

Append `<style>${safeCss(previewOverridesCss)}</style>` after the vendored and mobile styles so the immutable theme snapshot is not edited.

- [ ] **Step 4: Restructure the preview Dock markup**

Add `data-theme={theme}` to `.preview-surface`. Keep three semantic groups—back, statistics, controls—and wrap the theme/device buttons in fused subgroups with liquid indicators or a shared `::before` sliding pill keyed by `data-theme` and `data-viewport`. Retain every current accessible name, `aria-pressed`, and button action.

- [ ] **Step 5: Implement seamless surface and adaptive Dock CSS**

In `preview-frame.css`:

- define preview light/dark CSS variables under `.preview-surface[data-theme]`;
- make surface, viewport, and iframe backgrounds identical;
- remove iframe border, radius, shadow, and separate paper block;
- replace hard-coded light Dock backgrounds with adaptive translucent variables;
- fuse related controls with a moving active pill and stable hit targets;
- keep mobile controls wrapping without horizontal document overflow;
- add `@media (prefers-reduced-motion: reduce)` to disable Dock sliding/blur transitions.

- [ ] **Step 6: Run component, theme-integrity, and build checks**

Run: `npm test -- tests/components/PreviewFrame.test.tsx tests/unit/theme-manifest.test.ts`

Run: `npm run check:theme`

Run: `npm run build`

Expected: all commands exit 0, proving the vendored snapshot and manifest were not changed.

- [ ] **Step 7: Commit preview visuals**

```bash
git add src/preview/PreviewFrame.tsx src/preview/build-preview-document.ts src/preview/imx-preview-overrides.css src/preview/preview-frame.css tests/components/PreviewFrame.test.tsx
git commit -m "feat: unify IMX preview and liquid dock"
```

---

### Task 4: Browser Behavior, Contrast, and Visual Regression

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`
- Update: `tests/e2e/visual.spec.ts-snapshots/imx-preview-light-desktop-chromium-darwin.png`
- Update: `tests/e2e/visual.spec.ts-snapshots/imx-preview-dark-desktop-chromium-darwin.png`
- Update: `tests/e2e/visual.spec.ts-snapshots/imx-preview-light-mobile-chromium-darwin.png`
- Update: `tests/e2e/visual.spec.ts-snapshots/imx-preview-dark-mobile-chromium-darwin.png`
- Update when generated by CI-compatible local environment: corresponding `*-chromium-linux.png` baselines

**Interfaces:**
- Consumes: workspace data attributes and accessible names from Task 1
- Consumes: controlled preview theme from Task 2
- Consumes: approved CSS tokens and Dock structure from Task 3

- [ ] **Step 1: Add the right-rail browser assertions**

Extend `dock-and-sidebar.spec.ts` with a dedicated test that measures `.workspace-editor`, collapses `折叠文章操作`, verifies the action panel width reaches zero, editor width grows, focus remains on `展开文章操作`, reload restores collapsed, and the left rail remains independently expanded.

- [ ] **Step 2: Add preview/global theme synchronization assertions**

Add a test that starts dark, opens preview, checks the preview surface and iframe document are dark, selects light from preview, closes preview, verifies app HTML remains light, reloads, and verifies light persists.

```ts
await expect(page.locator('.preview-surface')).toHaveAttribute('data-theme', 'dark')
await page.getByRole('button', { name: '浅色预览' }).click()
await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
await expect.poll(() => page.locator('iframe[title="IMX 文章预览"]').evaluate(
  (frame) => frame.contentDocument?.documentElement.dataset.theme,
)).toBe('light')
```

- [ ] **Step 3: Add mobile action visibility assertions**

In the existing 390px test, assert `折叠文章操作` is hidden while `新建文章` and `保存到草稿库` remain visible and the page has no horizontal overflow.

- [ ] **Step 4: Add dark-preview computed-style assertions**

In `visual.spec.ts`, after opening dark preview, inspect the iframe document and assert body background is `rgb(21, 21, 19)`, article body text is `rgb(227, 220, 210)`, metadata is `rgb(183, 174, 162)`, and a TOC anchor computes to opacity `1` with color `rgb(200, 191, 179)`.

- [ ] **Step 5: Run behavioral E2E tests**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: all tests PASS with no mobile overflow or theme desynchronization.

- [ ] **Step 6: Generate and inspect visual baselines**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --update-snapshots`

Inspect all four generated desktop/mobile light/dark preview images. Accept only if the iframe boundary is visually seamless, Dock groups are readable and fused, dark metadata/TOC are legible, and no control overlaps at 390px.

- [ ] **Step 7: Run the full verification matrix**

Run: `npm test`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run check:theme`

Run: `npm run build`

Run: `npm run test:e2e`

Expected: every command exits 0. If screenshot output differs by platform rendering only, retain both reviewed Darwin and Linux baselines rather than loosening pixel thresholds globally.

- [ ] **Step 8: Commit browser coverage and reviewed snapshots**

```bash
git add tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "test: cover preview theme and action rail"
```

---

## Final Review Gate

- Confirm `git diff --check` has no output.
- Confirm `git status --short` contains only intentional plan implementation changes before each commit and is clean after the final commit.
- Confirm no files under `src/theme/imx/` changed.
- Manually compare light and dark preview Dock behavior, desktop right-rail collapse, and the 390px mobile layout.
- Report exact test commands and outcomes; do not claim Vercel deployment until a pushed commit has produced a successful deployment.
