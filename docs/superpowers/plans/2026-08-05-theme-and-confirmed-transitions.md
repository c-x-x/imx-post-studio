# Studio Theme and Confirmed Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Studio dark/light theme and require explicit save, discard, or cancel decisions before returning home or creating a new article.

**Architecture:** Keep application-theme persistence in a focused utility and expose it to the Dock through controlled props. Keep destructive navigation policy in `App`, with one pending-intent dialog that reuses the existing revision-safe draft persistence loop and `AccessibleDialog` focus behavior.

**Tech Stack:** React 19, TypeScript 6, CSS custom properties, Vitest/Testing Library, Playwright.

## Global Constraints

- The home heading is exactly “文字是时间里的不死鸟”.
- The Studio theme toggle is shown only on home and draft-library views; the article workspace shows only “预览文章” in that Dock action.
- The first theme follows `prefers-color-scheme`; a manual choice persists as `light` or `dark` in `localStorage`.
- Returning home from the workspace and every “新建文章” request use the same three choices: save and continue, continue without saving, or cancel.
- The prompt appears even for an untouched blank article.
- Existing autosave, recovery, import/export, preview-theme, mobile navigation, and accessibility contracts remain intact.

---

### Task 1: Application theme preference and Dock control

**Files:**
- Create: `src/app/theme-preference.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/home/HomePage.tsx`
- Test: `tests/unit/theme-preference.test.ts`
- Test: `tests/components/ImxDock.test.tsx`
- Test: `tests/components/App.test.tsx`

**Interfaces:**
- Produces: `type AppTheme = 'light' | 'dark'`.
- Produces: `readThemePreference(): AppTheme | undefined`, `resolveInitialTheme(): AppTheme`, `applyTheme(theme: AppTheme): void`, and `writeThemePreference(theme: AppTheme): void`.
- Extends `ImxDockProps` with `theme: AppTheme` and `onToggleTheme: () => void`.

- [ ] **Step 1: Write failing preference and component tests**

```ts
expect(resolveInitialTheme()).toBe('dark')
writeThemePreference('light')
expect(readThemePreference()).toBe('light')

render(<ImxDock {...props('home')} theme="light" />)
expect(screen.getByRole('button', { name: '切换到深色主题' })).toBeInTheDocument()

render(<App />)
expect(screen.getByRole('heading', { name: '文字是时间里的不死鸟' })).toBeInTheDocument()
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/unit/theme-preference.test.ts tests/components/ImxDock.test.tsx tests/components/App.test.tsx`

Expected: failures for missing preference module, Dock props/control, and new heading copy.

- [ ] **Step 3: Implement the preference boundary and controlled Dock button**

```ts
export type AppTheme = 'light' | 'dark'
const THEME_KEY = 'imx-post-studio-theme'

export function readThemePreference(): AppTheme | undefined {
  const value = window.localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : undefined
}

export function resolveInitialTheme(): AppTheme {
  return readThemePreference()
    ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme
}

export function writeThemePreference(theme: AppTheme): void {
  window.localStorage.setItem(THEME_KEY, theme)
}
```

In `App`, initialize and apply `theme`, persist only manual toggles, and pass the controlled value to `ImxDock`. Replace the home heading copy. In `ImxDock`, render a sun/moon action button only when `view !== 'workspace'`; retain preview as the only workspace action.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/unit/theme-preference.test.ts tests/components/ImxDock.test.tsx tests/components/App.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/theme-preference.ts src/app/App.tsx src/app/ImxDock.tsx src/home/HomePage.tsx tests/unit/theme-preference.test.ts tests/components/ImxDock.test.tsx tests/components/App.test.tsx
git commit -m "feat: add Studio theme control"
```

### Task 2: Clickable brand and explicit transition decision dialog

**Files:**
- Create: `src/app/TransitionConfirmDialog.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/app/imx-dock.css`
- Test: `tests/components/ImxDock.test.tsx`
- Test: `tests/components/transition-recovery.test.tsx`

**Interfaces:**
- Produces: `type ConfirmedIntent = 'home' | 'new'` inside `App`.
- Produces: `TransitionConfirmDialog({ intent, disabled, onCancel, onDiscard, onSave, returnFocus })`.
- `ImxDock.onHome` remains the single home callback used by both the brand and the home menu item.

- [ ] **Step 1: Write failing brand and dialog-flow tests**

```ts
await user.click(screen.getByRole('button', { name: 'IMX Post Studio，返回首页' }))
expect(callbacks.onHome).toHaveBeenCalledOnce()

fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
expect(screen.getByRole('dialog', { name: '新建文章前是否保存？' })).toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: '取消' }))
expect(screen.getByLabelText('标题')).toHaveValue('保留文章')
```

Add separate tests for save-and-continue, discard-and-continue, blank-draft prompting, brand/home behavior, and a rejected `draftRepository.put` that keeps the workspace and dialog open.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/components/ImxDock.test.tsx tests/components/transition-recovery.test.tsx`

Expected: failures because the brand is not interactive and home/new currently transition without the decision dialog.

- [ ] **Step 3: Implement one pending-intent state machine**

```ts
type ConfirmedIntent = 'home' | 'new'

const requestConfirmedIntent = (intent: ConfirmedIntent) => {
  if (view !== 'workspace') {
    executeConfirmedIntent(intent)
    return
  }
  confirmReturnFocus.current = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  setPendingIntent(intent)
}
```

`executeConfirmedIntent('home')` sets the home view. `executeConfirmedIntent('new')` creates a fresh draft, resets `draftStarted`, and stays in the workspace. The save action reuses a shared `persistLatestDraft()` revision loop; only a successful save executes the intent. The discard action executes without an additional write. Cancel closes and restores focus.

Render the brand as one button containing `ImxLogo` and the heading text, and route both it and the home menu item through `onHome`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/components/ImxDock.test.tsx tests/components/transition-recovery.test.tsx`

Expected: all focused tests pass, including save failure and focus restoration.

- [ ] **Step 5: Commit**

```bash
git add src/app/TransitionConfirmDialog.tsx src/app/App.tsx src/app/ImxDock.tsx src/app/imx-dock.css tests/components/ImxDock.test.tsx tests/components/transition-recovery.test.tsx
git commit -m "feat: confirm home and new article transitions"
```

### Task 3: Complete IMX dark appearance

**Files:**
- Modify: `src/app/app.css`
- Modify: `src/app/imx-dock.css`
- Test: `tests/e2e/dock-and-sidebar.spec.ts`
- Test: `tests/e2e/visual.spec.ts`

**Interfaces:**
- Consumes: `document.documentElement.dataset.theme` from Task 1.
- Produces: dark values for all existing `--imx-*` application tokens and explicit glass/CodeMirror overrides where hard-coded light colors remain.

- [ ] **Step 1: Add failing browser assertions for visibility and persistence**

```ts
await page.getByRole('button', { name: '切换到深色主题' }).click()
await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
await page.reload()
await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
await page.getByRole('button', { name: '文章', exact: true }).click()
await expect(page.getByRole('button', { name: /切换到.*主题/ })).toHaveCount(0)
```

Also assert dark computed backgrounds for the page, home card, Dock part, dialog, editor, and input.

- [ ] **Step 2: Run the focused Chromium tests and verify RED**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts --project=chromium --grep "theme|meaningful content"`

Expected: failures because the application has no complete dark token set.

- [ ] **Step 3: Add dark tokens and targeted overrides**

```css
:root[data-theme='dark'] {
  color-scheme: dark;
  --imx-paper: #191816;
  --imx-paper-alt: #11110f;
  --imx-paper-deep: #24221f;
  --imx-ink: #eeeae3;
  --imx-ink-secondary: #c7c0b6;
  --imx-ink-muted: #938b80;
  --imx-line: rgba(255, 255, 255, .12);
  --imx-card: rgba(28, 27, 24, .82);
}
```

Use dark translucent surfaces and shadows for `.imx-dock__shell`, Dock parts, cards, inputs, dialogs, CodeMirror gutters/content, notices, and destructive/recovery states. Preserve the brown IMX accent and contrast ratios.

- [ ] **Step 4: Run focused browser tests and inspect screenshots**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts --project=chromium --grep "theme|meaningful content"`

Expected: focused tests pass with no overflow, blank page, console error, or error overlay.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.css src/app/imx-dock.css tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts
git commit -m "style: add IMX Studio dark theme"
```

### Task 4: Full regression and integration readiness

**Files:**
- Modify only failing tests whose assumptions were intentionally changed by the approved specification.

**Interfaces:**
- Consumes all prior task outputs.
- Produces a clean, verified feature branch ready for local merge or push.

- [ ] **Step 1: Run code-level verification**

Run: `npm test`

Expected: all Vitest files and tests pass.

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

Run: `npm run build`

Expected: Vite production build exits 0.

- [ ] **Step 2: Run complete browser verification**

Run: `npm run test:e2e`

Expected: Chromium, Firefox, and WebKit suites complete with zero failures; project-defined skips remain skips.

- [ ] **Step 3: Inspect repository state**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short --branch`

Expected: only intentional commits on the feature branch and no uncommitted files.

- [ ] **Step 4: Hand off integration choice**

Offer local merge, draft PR, or keeping the branch. Do not push until the user explicitly authorizes it.
