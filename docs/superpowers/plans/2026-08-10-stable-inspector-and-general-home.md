# Stable Inspector and General Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the inspector tab height and replace Hugo/IMX-specific home copy with a standalone local-first Markdown writing position.

**Architecture:** Keep the current React component structure and solve the layout defect in CSS by constraining the inspector grid to intrinsic top-aligned rows. Update only the home content model and its assertions; no export, preview, or draft behavior changes.

**Tech Stack:** React 19, TypeScript, CSS Grid, Vitest, Testing Library, Playwright.

## Global Constraints

- Keep the product name and logo unchanged.
- Keep the existing IMX-style visual language.
- Do not introduce dependencies or alter article, draft, preview, media, or export contracts.
- The home page must not position the product as dependent on Hugo or IMX.

---

### Task 1: Stabilize inspector tab sizing

**Files:**
- Modify: `src/app/app.css`
- Test: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Consumes: `.workspace-inspector` and `.inspector-view-tabs` rendered by `App`.
- Produces: a top-aligned inspector grid whose tab strip retains the same pixel height across view changes.

- [ ] **Step 1: Write the failing browser regression test**

Add a test that opens the article workspace, captures `.inspector-view-tabs` height, switches to `大纲`, switches back to `文章设置`, and asserts every measured height equals the initial height and remains below 64 CSS pixels.

```ts
test('keeps inspector tabs at their intrinsic height from first render', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '文章', exact: true }).click()
  const tabs = page.locator('.inspector-view-tabs')
  const initialHeight = (await tabs.boundingBox())?.height ?? 0
  expect(initialHeight).toBeGreaterThan(0)
  expect(initialHeight).toBeLessThan(64)

  await page.getByRole('tab', { name: '大纲', exact: true }).click()
  expect((await tabs.boundingBox())?.height).toBe(initialHeight)
  await page.getByRole('tab', { name: '文章设置', exact: true }).click()
  expect((await tabs.boundingBox())?.height).toBe(initialHeight)
})
```

- [ ] **Step 2: Run the focused test before implementation**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "intrinsic height"`

Expected: the regression test exposes the unstable initial layout where reproducible; the explicit layout contract is absent from CSS.

- [ ] **Step 3: Constrain the grid to intrinsic rows**

Update `.workspace-inspector` so its grid content starts at the top and implicit rows use max-content sizing. Update `.inspector-view-tabs` to align itself to the start and prevent stretching.

```css
.workspace-inspector {
  align-content: start;
  grid-auto-rows: max-content;
}

.inspector-view-tabs {
  align-self: start;
}
```

- [ ] **Step 4: Run the focused browser test**

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "intrinsic height"`

Expected: PASS.

- [ ] **Step 5: Commit the independently testable layout fix**

```bash
git add src/app/app.css tests/e2e/dock-and-sidebar.spec.ts
git commit -m "fix: stabilize inspector tab sizing"
```

### Task 2: Generalize the home page

**Files:**
- Modify: `src/home/HomePage.tsx`
- Modify: `tests/components/App.test.tsx`
- Modify: `tests/e2e/visual.spec.ts`

**Interfaces:**
- Consumes: existing `HomePageProps` navigation callbacks.
- Produces: unchanged navigation behavior with general Markdown-studio copy and the Jane Eyre quotation.

- [ ] **Step 1: Replace the component expectations first**

Update the home component test to require the quote and generic positioning, and to reject old Hugo/IMX feature copy.

```ts
expect(screen.getByRole('heading', { name: 'I am no bird; and no net ensnares me.' })).toBeInTheDocument()
expect(screen.getByText(/本地优先的 Markdown 写作工作台/)).toBeInTheDocument()
expect(screen.queryByText('Hugo 输出')).not.toBeInTheDocument()
expect(screen.queryByText('IMX 预览')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm test -- tests/components/App.test.tsx`

Expected: FAIL because the old slogan and Hugo/IMX-specific copy are still rendered.

- [ ] **Step 3: Rewrite the home content without changing behavior**

In `HomePage.tsx`:

- use `I am no bird; and no net ensnares me.` as the hero heading;
- show `Charlotte Brontë · Jane Eyre` as attribution;
- introduce the app as a local-first Markdown writing studio;
- use the three principles `本地写作`, `即时呈现`, and `自由带走`;
- change the workflow title to `从灵感到完整文章` and describe writing, media management, and preview/export;
- retain both navigation buttons and the Markdown syntax reference.

- [ ] **Step 4: Update browser-level home assertions**

Extend the existing home visual smoke test with:

```ts
await expect(page.getByRole('heading', { name: 'I am no bird; and no net ensnares me.' })).toBeVisible()
await expect(page.getByText('Charlotte Brontë · Jane Eyre')).toBeVisible()
await expect(page.getByText('Hugo 输出')).toHaveCount(0)
await expect(page.getByText('IMX 预览')).toHaveCount(0)
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/components/App.test.tsx`

Run: `npx playwright test tests/e2e/visual.spec.ts --project=chromium --grep "loads meaningful content"`

Expected: both commands PASS.

- [ ] **Step 6: Run the project verification set**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run build`

Run: `npx playwright test tests/e2e/dock-and-sidebar.spec.ts tests/e2e/visual.spec.ts --project=chromium`

Expected: all commands PASS.

- [ ] **Step 7: Commit the home rewrite**

```bash
git add src/home/HomePage.tsx tests/components/App.test.tsx tests/e2e/visual.spec.ts
git commit -m "feat: generalize the studio home page"
```
