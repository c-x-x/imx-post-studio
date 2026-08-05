# IMX Dock and Immersive Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the pinned IMX theme Dock into Post Studio and add a persistent, accessible desktop settings-sidebar collapse mode.

**Architecture:** Replace the inline header with a focused `ImxDock` component and a ref-scoped `useSharedDock` hook adapted from the pinned theme revision. Keep sidebar preference handling in a small storage module, while `App` owns only the UI state and passes existing actions into the new Dock.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest, Testing Library, Playwright, Vite.

## Global Constraints

- `hugo-theme-imx` and `c-x-x.github.io` remain read-only.
- Port from IMX revision `6f08e8e5bba774a8e1fa0c2fa911c7435dddd9c7` and keep source provenance comments in adapted files.
- Preserve autosave, drafts, media, import/export, recovery, preview, and current button labels.
- Do not add a global Studio dark mode.
- Mobile keeps the existing `设置` / `写作` workspace tabs.
- All timers, animation frames, observers, listeners, and body classes must be removed during React cleanup.

---

### Task 1: Persistent immersive sidebar state

**Files:**
- Create: `src/app/sidebar-preference.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Test: `tests/unit/sidebar-preference.test.ts`
- Test: `tests/components/Workspace.test.tsx`

**Interfaces:**
- Produces: `readSettingsCollapsed(storage?: Pick<Storage, 'getItem'>): boolean`
- Produces: `writeSettingsCollapsed(collapsed: boolean, storage?: Pick<Storage, 'setItem'>): void`
- Produces: workspace attribute `data-inspector-collapsed="true|false"` and button names `折叠文章设置` / `展开文章设置`.

- [ ] **Step 1: Write storage and component tests that fail**

```ts
it('falls back safely when sidebar preference storage is unavailable', () => {
  expect(readSettingsCollapsed({ getItem: () => { throw new Error('blocked') } })).toBe(false)
  expect(() => writeSettingsCollapsed(true, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
})

it('collapses and restores the desktop settings sidebar', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '新建文章' }))
  await user.click(screen.getByRole('button', { name: '折叠文章设置' }))
  expect(screen.getByRole('region', { name: '文章工作区' })).toHaveAttribute('data-inspector-collapsed', 'true')
  expect(screen.getByRole('button', { name: '展开文章设置' })).toHaveAttribute('aria-expanded', 'false')
})
```

- [ ] **Step 2: Run the focused tests and verify the missing module/control failures**

Run: `npm test -- --run tests/unit/sidebar-preference.test.ts tests/components/Workspace.test.tsx`

Expected: FAIL because `sidebar-preference.ts` and the collapse control do not exist.

- [ ] **Step 3: Implement the safe preference adapter and App state**

```ts
const SETTINGS_COLLAPSED_KEY = 'imx-post-studio:settings-collapsed'

export function readSettingsCollapsed(storage = localStorage): boolean {
  try { return storage.getItem(SETTINGS_COLLAPSED_KEY) === 'true' } catch { return false }
}

export function writeSettingsCollapsed(collapsed: boolean, storage = localStorage): void {
  try { storage.setItem(SETTINGS_COLLAPSED_KEY, String(collapsed)) } catch { /* UI state remains usable */ }
}
```

In `App`, initialize `settingsCollapsed` lazily, write it after toggles, set `data-inspector-collapsed`, and place the toggle between the inspector and editor. The toggle must not dispatch article actions.

- [ ] **Step 4: Implement the desktop grid transition and visually hidden scrollbar**

Use a three-column desktop grid (`inspector`, `toggle`, `editor`), switch the inspector column to `0fr` when collapsed, preserve `overflow-y: auto`, and apply both `scrollbar-width: none` and a zero-sized `::-webkit-scrollbar`. At `max-width: 1023px`, hide the collapse control and restore the current tab layout.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- --run tests/unit/sidebar-preference.test.ts tests/components/Workspace.test.tsx`

Expected: PASS.

Commit: `feat: add immersive settings sidebar`

---

### Task 2: IMX Dock component and mobile navigation

**Files:**
- Create: `src/app/ImxLogo.tsx`
- Create: `src/app/ImxDock.tsx`
- Create: `src/app/imx-dock.css`
- Modify: `src/app/App.tsx`
- Test: `tests/components/ImxDock.test.tsx`
- Test: `tests/components/transition-recovery.test.tsx`

**Interfaces:**
- Consumes: existing `startNew`, `showDashboard`, `openPreview`, `workspaceLocked`, `previewTrigger`, and `view` values from `App`.
- Produces: `ImxDockProps` with `view`, `disabled`, `previewTrigger`, `onPreview`, `onNew`, and `onDashboard`.
- Produces: `.imx-dock`, `.imx-dock__brand`, `.imx-dock__menu`, `.imx-dock__actions`, and `.imx-dock__shell` elements.

- [ ] **Step 1: Write failing Dock behavior tests**

```tsx
it('exposes Studio actions in the IMX three-part Dock', async () => {
  render(<ImxDock view="workspace" disabled={false} previewTrigger={createRef()} onPreview={onPreview} onNew={onNew} onDashboard={onDashboard} />)
  expect(screen.getByRole('navigation', { name: 'Studio 导航' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '预览文章' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '新建文章' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '草稿库' })).toHaveAttribute('aria-current', 'false')
})

it('opens and dismisses the mobile menu accessibly', async () => {
  const user = userEvent.setup()
  render(<ImxDock {...props} />)
  const toggle = screen.getByRole('button', { name: '打开菜单' })
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{Escape}')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run tests/components/ImxDock.test.tsx tests/components/transition-recovery.test.tsx`

Expected: FAIL because `ImxDock` is not implemented.

- [ ] **Step 3: Implement the theme-equivalent Dock structure**

Port the pinned header's logo and ink-hover SVG into `ImxLogo`. Render the three Dock regions with Studio buttons. Keep preview in the right capsule, and keep new/drafts in the center menu. On dashboard, omit preview without leaving an inaccessible empty control.

- [ ] **Step 4: Implement mobile menu state and cleanup**

Use React state plus effects for Escape, outside click, and `(max-width: 768px)` changes. Close the menu after a navigation action and expose changing `aria-label` and `aria-expanded` values. Do not clone the theme's global `document.querySelector` logic.

- [ ] **Step 5: Port static and responsive Dock CSS**

Adapt the pinned `navigation.css` and `responsive.css` rules under `.imx-dock`; keep the original liquid-glass variables, dimensions, radii, shadows, logo hover drawing, mobile menu transition, and `prefers-reduced-motion` rules. Remove the old `.app-header`, `.app-brand`, and `.app-header-actions` styling after integration.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- --run tests/components/ImxDock.test.tsx tests/components/Workspace.test.tsx tests/components/transition-recovery.test.tsx`

Expected: PASS with existing transition locking preserved.

Commit: `feat: port IMX dock structure`

---

### Task 3: Shared Dock attraction and merge behavior

**Files:**
- Create: `src/app/use-shared-dock.ts`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/app/imx-dock.css`
- Test: `tests/unit/shared-dock.test.ts`
- Test: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Produces: `smoothStep(edge0: number, edge1: number, value: number): number` for deterministic math tests.
- Produces: `useSharedDock(navRef: RefObject<HTMLElement | null>): void`.
- Produces: `.is-dock-attracting` and `.is-dock-merged` state classes plus the pinned `--home-dock-*` CSS variables.

- [ ] **Step 1: Write failing math and browser-state tests**

```ts
it('clamps and eases Dock attraction exactly at its boundaries', () => {
  expect(smoothStep(0.06, 0.78, -1)).toBe(0)
  expect(smoothStep(0.06, 0.78, 1)).toBe(1)
  expect(smoothStep(0.06, 0.78, 0.42)).toBeCloseTo(0.5)
})

test('attracts and merges the desktop Dock as the page scrolls', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.locator('.imx-dock')).toHaveClass(/is-dock-merged/)
  await expect(page.locator('.imx-dock')).toHaveCSS('--home-dock-shell-opacity', '1.000')
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run tests/unit/shared-dock.test.ts`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: FAIL because the math helper, hook, and merged state do not exist.

- [ ] **Step 3: Port the pinned Dock algorithm into the scoped hook**

Adapt measurements, hysteresis (`0.88` enter, `0.80` exit), attraction easing, shell geometry, resize invalidation, reduced-motion handling, and edge-snap cancellation from `dock.js`. Query only descendants of `navRef.current`. The effect cleanup must cancel pending frames/timers, detach all listeners/media-query listeners, and remove Dock body classes.

- [ ] **Step 4: Make scroll verification deterministic**

Use the Studio document's scroll range with the same normalized progress and thresholds. The E2E fixture must add temporary document height through page evaluation rather than changing production layout solely for testing.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- --run tests/unit/shared-dock.test.ts tests/components/ImxDock.test.tsx`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: PASS.

Commit: `feat: add IMX dock attraction behavior`

---

### Task 4: Responsive, accessibility, and visual regression coverage

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`
- Create: `tests/e2e/visual.spec.ts-snapshots/imx-studio-workspace-desktop-chromium-darwin.png`
- Create: `tests/e2e/visual.spec.ts-snapshots/imx-studio-workspace-mobile-chromium-darwin.png`
- Modify: `docs/release-verification.md`

**Interfaces:**
- Consumes: Dock class states, mobile menu accessibility, sidebar data state, and current Playwright visual options.
- Produces: stable desktop/mobile Studio shell screenshots and explicit release checks.

- [ ] **Step 1: Extend E2E behavior coverage**

Assert that the desktop toggle collapses the inspector width to zero, expands the editor, retains keyboard focus, restores after reload, and reports hidden scrollbar CSS. At 390 px, assert the collapse toggle is hidden, workspace tabs remain usable, the Dock menu opens without horizontal overflow, and the current action closes it.

- [ ] **Step 2: Add visual captures and inspect them before approval**

Capture a populated workspace at `1440x900` and `390x844`, with animations disabled and bundled fonts loaded. Inspect both images for Dock spacing, glass edges, menu alignment, toggle placement, editor width, and mobile overflow before accepting snapshots.

- [ ] **Step 3: Run accessibility and regression suites**

Run: `npm test`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run check:theme`

Run: `npm run test:e2e`

Expected: all commands exit `0`; Playwright reports only the existing intentional cross-browser screenshot skips.

- [ ] **Step 4: Record release verification and commit**

Add the exact commands, pass counts, Dock source revision, screenshot names, and any non-blocking bundle-size warning to `docs/release-verification.md`.

Commit: `test: verify IMX dock and immersive sidebar`
