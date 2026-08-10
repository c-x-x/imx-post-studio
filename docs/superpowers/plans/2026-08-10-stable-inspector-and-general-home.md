# Stable Inspector and General Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the inspector tab height and replace Hugo/IMX-specific home copy with a standalone local-first Markdown writing position.

**Architecture:** Keep the current React component structure and solve the inspector defect in CSS with intrinsic top-aligned rows. Update only the home content model for the product-positioning change, and extend the existing CodeMirror decoration layer so inactive heading prefixes include their separator space; no export, preview, draft, or stored Markdown contracts change.

**Tech Stack:** React 19, TypeScript, CSS Grid, Vitest, Testing Library, Playwright.

## Global Constraints

- Keep the product name and logo unchanged.
- Keep the existing IMX-style visual language.
- Do not introduce dependencies or alter article, draft, preview, media, or export contracts.
- The home page must not position the product as dependent on Hugo or IMX.
- Instant-layout headings from H1 through H6 must share the paragraph content boundary without changing stored Markdown or source-mode behavior.

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

### Task 3: Align instant-layout headings with paragraph text

**Files:**
- Modify: `src/editor/live-markdown.ts`
- Test: `tests/unit/live-markdown.test.ts`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: Lezer `ATXHeading1` through `ATXHeading6` nodes and their `HeaderMark` children.
- Produces: inactive heading prefix decorations that hide the marker plus its single separator space while preserving the complete Markdown document.

- [ ] **Step 1: Write the failing unit regression test**

Render H1 through H6 with the selection in an ordinary paragraph. Assert each `.cm-md-heading-N .cm-md-hidden` contains the exact Markdown prefix including its trailing space. Move the selection into one heading and assert that line has no hidden prefix.

```ts
test('hides heading markers with their separator while revealing the active heading source', () => {
  const doc = [
    '# 一级', '## 二级', '### 三级',
    '#### 四级', '##### 五级', '###### 六级',
    '普通正文',
  ].join('\n')
  const view = createView(doc, doc.indexOf('普通正文'))

  for (let depth = 1; depth <= 6; depth += 1) {
    expect(view.dom.querySelector(`.cm-md-heading-${depth} .cm-md-hidden`)?.textContent)
      .toBe(`${'#'.repeat(depth)} `)
  }

  view.dispatch({ selection: { anchor: doc.indexOf('三级') } })
  expect(view.dom.querySelector('.cm-md-heading-3 .cm-md-hidden')).toBeNull()
  expect(view.state.doc.toString()).toBe(doc)
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npm test -- tests/unit/live-markdown.test.ts -t "separator"`

Expected: FAIL because each current hidden prefix contains only the `#` marker sequence and leaves the separator visible.

- [ ] **Step 3: Extend inactive heading prefix decoration**

In `buildDecorations`, special-case `HeaderMark`: when its heading block is inactive, extend the hidden decoration through exactly one following space or tab before the heading text. Do not alter the document, active block selection, or generic handling for other marker types.

```ts
function hiddenMarkerRange(state: EditorState, node: SyntaxNode): BlockRange {
  if (node.name !== 'HeaderMark') return { from: node.from, to: node.to }
  const separator = state.doc.sliceString(node.to, node.to + 1)
  return { from: node.from, to: /[\t ]/.test(separator) ? node.to + 1 : node.to }
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm test -- tests/unit/live-markdown.test.ts -t "separator"`

Expected: PASS with the source document unchanged.

- [ ] **Step 5: Add a browser-level visual geometry assertion**

In the existing live-writing browser test, locate the first rendered text character on each inactive heading and the ordinary paragraph with DOM `Range#getBoundingClientRect()`. Assert all seven left coordinates differ by no more than one CSS pixel.

```ts
const leftEdges = await page.locator('.cm-content').evaluate((content) => {
  const lines = [...content.querySelectorAll<HTMLElement>('.cm-line')]
  return lines.slice(0, 13).filter((_, index) => index % 2 === 0).map((line) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.cm-md-hidden') || !node.textContent?.trim()
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT
      },
    })
    const text = walker.nextNode()
    if (!text) throw new Error('Missing visible editor text')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 1)
    return range.getBoundingClientRect().left
  })
})
expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(1)
```

- [ ] **Step 6: Run focused editor verification**

Run: `npm test -- tests/unit/live-markdown.test.ts`

Run: `npx playwright test tests/e2e/editor.spec.ts --project=chromium --grep "live writing formats"`

Expected: both commands PASS, including the existing source preservation, task interaction, outline navigation, and responsive wrapping assertions.

- [ ] **Step 7: Commit the independently testable editor fix**

```bash
git add src/editor/live-markdown.ts tests/unit/live-markdown.test.ts tests/e2e/editor.spec.ts
git commit -m "fix: align live headings with body text"
```
