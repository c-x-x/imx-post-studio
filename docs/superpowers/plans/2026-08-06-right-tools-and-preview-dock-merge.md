# Right Tools and Preview Dock Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move media and bundle operations into the right tools rail and give the preview Dock the same shared scroll-merging behavior as the main IMX Dock.

**Architecture:** Compose one right-rail container in `App` that owns new/save, media, and bundle controls while CSS keeps those controls in the mobile settings flow. Generalize `useSharedDock` around semantic Dock-role attributes, then connect both the main and preview Docks to the same hook, thresholds, geometry, state classes, and structural CSS variables.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest, Testing Library, Playwright, Vite

## Global Constraints

- Do not change article data, front matter, Markdown rendering, ZIP formats, recovery rules, or the vendored IMX theme snapshot.
- Preserve all current accessible names, validation, focus recovery, confirmation dialogs, theme synchronization, and iframe sandboxing.
- Desktop right rail remains default-expanded, independently persisted, scrollable with a hidden scrollbar, and fully collapsible.
- Mobile shows metadata followed by all tools in “设置” and hides tools in “写作”.
- `useSharedDock` is the only implementation of scroll progress, merge thresholds, interpolation, resize handling, reduced motion, and cleanup.
- Preview uses the same `is-dock-attracting`, `is-dock-merged`, body state, and CSS variables as the main Dock.

---

### Task 1: Move Media and Bundle Controls into the Right Tools Rail

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/ArticleActions.tsx`
- Modify: `src/app/app.css`
- Modify: `tests/components/Workspace.test.tsx`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Produces: `aside#panel-actions.workspace-actions` containing `ArticleActions`, `MediaPanel`, and `BundleActions`
- Preserves: right toggle `aria-controls="panel-actions"`
- Preserves: component callback signatures for media and bundle operations

- [ ] **Step 1: Write a failing component placement test**

Add a test to `tests/components/Workspace.test.tsx` that opens the article view and asserts:

```ts
const settings = document.querySelector('#panel-settings')!
const tools = document.querySelector('#panel-actions')!
expect(within(settings).getByRole('heading', { name: '文章设置' })).toBeInTheDocument()
expect(within(settings).queryByRole('heading', { name: '媒体' })).not.toBeInTheDocument()
expect(within(tools).getByRole('group', { name: '文章操作' })).toBeInTheDocument()
expect(within(tools).getByRole('heading', { name: '媒体' })).toBeInTheDocument()
expect(within(tools).getByRole('group', { name: '文章包操作' })).toBeInTheDocument()
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/components/Workspace.test.tsx`

Expected: FAIL because media and bundle controls are still descendants of `#panel-settings`, and `#panel-actions` is only the two-button action group.

- [ ] **Step 3: Compose the complete tools rail**

Remove `id="panel-actions"` and `workspace-actions` from `ArticleActions`, leaving it as the semantic `文章操作` group. In `App.tsx`, leave only `MetadataPanel` in `#panel-settings`, and replace the standalone `ArticleActions` grid child with:

```tsx
<aside id="panel-actions" className="workspace-actions" aria-label="文章工具">
  <ArticleActions disabled={workspaceLocked} onNew={() => void startNew()} onSave={() => void saveCurrentDraft()} />
  <MediaPanel {...existingMediaProps} />
  <BundleActions {...existingBundleProps} />
</aside>
```

Move the existing props verbatim; do not recreate handlers or change busy-state inputs.

- [ ] **Step 4: Adjust desktop and mobile rail CSS**

Make `.workspace-actions` a sticky vertical scroll container with `max-height: calc(100dvh - 112px)`, `overflow: auto`, `scrollbar-width: none`, and a zero-size WebKit scrollbar. Keep `.article-actions` vertical on desktop. At `max-width: 768px`, keep `.workspace-actions` in normal flow, show it only when `.workspace-grid[data-tab='settings']`, hide it for `data-tab='write'`, and keep its internal sections vertical while only `.article-actions` uses a horizontal two-button row.

- [ ] **Step 5: Run focused component tests**

Run: `npm test -- tests/components/Workspace.test.tsx tests/components/MediaPanel.test.tsx tests/components/BundleActions.test.tsx`

Expected: all tests PASS.

- [ ] **Step 6: Extend browser assertions**

Update the right-rail browser test to assert `.media-panel` and `.bundle-actions` are inside `#panel-actions`, the whole rail width becomes zero when collapsed, and its scrollbar width is `none`. Extend the mobile test to select “设置”, verify media/import actions are visible, then select “写作” and verify the tools rail is hidden while the editor is visible.

- [ ] **Step 7: Run browser layout coverage**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: all tests PASS with no desktop or mobile overflow.

- [ ] **Step 8: Commit the tools move**

```bash
git add src/app/App.tsx src/app/ArticleActions.tsx src/app/app.css tests/components/Workspace.test.tsx tests/e2e/dock-and-sidebar.spec.ts
git commit -m "feat: move article tools to right rail"
```

---

### Task 2: Generalize and Reuse the Shared Dock Merge Mechanism

**Files:**
- Create: `src/app/shared-dock.css`
- Modify: `src/app/use-shared-dock.ts`
- Modify: `src/app/ImxDock.tsx`
- Modify: `src/app/imx-dock.css`
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/preview/preview-frame.css`
- Modify: `tests/unit/shared-dock.test.ts`
- Modify: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Produces: `resolveSharedDockParts(root: HTMLElement): SharedDockParts | undefined`
- Produces semantic attributes: `data-shared-dock="container|shell|left|center|right|action-control"`
- Consumes: `useSharedDock(ref)` unchanged for both Dock components

- [ ] **Step 1: Write failing shared-role lookup tests**

Extend `tests/unit/shared-dock.test.ts` with two DOM fixtures that use different class names but the same semantic attributes:

```ts
const root = document.createElement('nav')
root.innerHTML = `
  <div data-shared-dock="container">
    <span data-shared-dock="shell"></span>
    <div data-shared-dock="left"></div>
    <div data-shared-dock="center"></div>
    <div data-shared-dock="right"><button data-shared-dock="action-control"></button></div>
  </div>`
const parts = resolveSharedDockParts(root)
expect(parts?.container).toBe(root.firstElementChild)
expect(parts?.left.dataset.sharedDock).toBe('left')
expect(parts?.actionControl.tagName).toBe('BUTTON')
```

Also assert an incomplete fixture returns `undefined`.

- [ ] **Step 2: Run the unit test and verify RED**

Run: `npm test -- tests/unit/shared-dock.test.ts`

Expected: FAIL because `resolveSharedDockParts` is not exported.

- [ ] **Step 3: Implement semantic role resolution and use it in the hook**

Define and export `SharedDockParts`, implement `resolveSharedDockParts` with exact `[data-shared-dock="..."]` selectors, and replace the six hard-coded class queries inside `useSharedDock`. Preserve all math, thresholds, requestAnimationFrame scheduling, media-query handling, state classes, body state, and cleanup unchanged.

- [ ] **Step 4: Mark up the main Dock roles**

Add semantic attributes to the existing main Dock container, shell, brand, menu, actions, and representative preview/theme/menu control. Keep all current class names so this is behavior-preserving.

- [ ] **Step 5: Write the failing preview shared-Dock component test**

In `PreviewFrame.test.tsx`, assert the preview contains every shared Dock role and that the root has `has-shared-dock`. This must fail before preview markup changes.

- [ ] **Step 6: Connect preview markup to the shared hook**

Create `previewDockRef`, call `useSharedDock(previewDockRef)`, make `.preview-dock` the shared root, add a container around its three existing parts, add an inert shared shell span, and assign left/center/right/action-control roles. Keep every preview button, accessible name, pressed state, and action unchanged.

- [ ] **Step 7: Extract shared structural CSS**

Create `shared-dock.css` for shared variable defaults, shell geometry/crossfade, part surface crossfade, left/right transforms, and common merged-state interaction rules using semantic attributes. Import it from both Dock consumers. Remove only structurally identical declarations from `imx-dock.css` and `preview-frame.css`; retain component-specific fixed positioning, grid dimensions, color tokens, icons, and responsive rules.

- [ ] **Step 8: Run focused tests and build checks**

Run: `npm test -- tests/unit/shared-dock.test.ts tests/components/ImxDock.test.tsx tests/components/PreviewFrame.test.tsx`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 9: Commit shared Dock reuse**

```bash
git add src/app/shared-dock.css src/app/use-shared-dock.ts src/app/ImxDock.tsx src/app/imx-dock.css src/preview/PreviewFrame.tsx src/preview/preview-frame.css tests/unit/shared-dock.test.ts tests/components/PreviewFrame.test.tsx
git commit -m "feat: reuse shared dock merge in preview"
```

---

### Task 3: Preview Merge E2E, Visual Review, and Full Regression

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`
- Update: Darwin preview-shell snapshots under `tests/e2e/visual.spec.ts-snapshots/`

**Interfaces:**
- Consumes: shared Dock variables and state classes from Task 2
- Preserves: Linux functional/color assertions and existing article snapshots

- [ ] **Step 1: Add a failing preview merge browser test**

Open preview with enough article height, scroll `.preview-surface` to approximately `0.45 * clientHeight`, and poll `--home-dock-shell-opacity` plus `--home-dock-part-bg-alpha`. Scroll beyond one viewport and assert `.preview-dock.is-dock-merged`; return to top and assert the merged class is removed.

- [ ] **Step 2: Add mobile and reduced-motion assertions**

At 390px, scroll preview and assert it never receives `is-dock-merged` and has no horizontal overflow. With reduced motion, assert state changes still occur but the continuous attraction state is not required.

- [ ] **Step 3: Run the focused E2E test**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: PASS after Task 2; if it fails, fix shared-role wiring or preview scroll measurement rather than adding a second preview scroll implementation.

- [ ] **Step 4: Update and inspect macOS preview-shell visuals**

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --update-snapshots`

Inspect light/dark desktop and mobile preview-shell images. Desktop captures must show a coherent shared shell at the captured scroll state; mobile captures must retain the compact separated layout. Do not create Linux shell snapshots from copied macOS images.

- [ ] **Step 5: Run the complete verification matrix**

Run: `npm test`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run check:theme`

Run: `npm run build`

Run: `npm run test:e2e`

Expected: all commands exit 0; current project expectations are 34 Vitest files and the full Playwright matrix with browser-specific skips only.

- [ ] **Step 6: Verify boundaries and commit**

Run: `git diff --check`

Run: `git diff --name-only HEAD -- src/theme/imx`

Expected: no whitespace errors and no vendored theme files changed.

```bash
git add tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts tests/e2e/visual.spec.ts-snapshots
git commit -m "test: cover preview dock merging"
```

---

## Final Review Gate

- Confirm the right rail contains all article tools on desktop and restores its persisted collapse state.
- Confirm mobile “设置” contains metadata and tools while “写作” contains only the editor.
- Confirm both Dock consumers call the same `useSharedDock` implementation and no preview-specific scroll handler exists.
- Confirm preview merging reverses at the same thresholds as the main Dock and cleans up when closed.
- Confirm the worktree is clean and report exact local and remote verification separately.
