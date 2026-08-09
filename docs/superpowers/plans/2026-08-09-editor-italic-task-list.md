# Editor Italic and Task List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add italic and task-list toolbar commands, plus clickable GFM task checkboxes that update Markdown and autosave.

**Architecture:** Keep Markdown creation in the existing pure command module. Render `TaskMarker` nodes as CodeMirror widgets backed by precise document transactions, so the controlled editor and current autosave path remain the only source of truth.

**Tech Stack:** React 19, TypeScript, CodeMirror 6, Lezer Markdown with GFM, Vitest, Playwright.

## Global Constraints

- Instant mode toggles only the exact `[ ]` or `[x]` marker; source mode renders literal Markdown.
- Disabled editors cannot run toolbar commands or toggle task checkboxes.
- Do not change preview/export formats, draft schema, or `hugo-theme-imx`.
- Preserve and verify the pending CodeMirror heading-underline fix.

---

### Task 1: Preserve the Verified Heading Fix

**Files:**
- Modify: `src/editor/editor.css`
- Test: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Produces: live Markdown headings whose syntax spans compute to `textDecorationLine: 'none'`.

- [ ] **Step 1: Re-run the existing red-green regression evidence**

Run: `npx playwright test tests/e2e/editor.spec.ts --grep 'live writing'`

Expected: PASS in Chromium, Firefox, and WebKit for all six heading levels.

- [ ] **Step 2: Commit only the verified heading fix**

```bash
git add src/editor/editor.css tests/e2e/editor.spec.ts
git commit -m "fix: remove live Markdown heading underlines"
```

### Task 2: Italic and Task Commands

**Files:**
- Modify: `src/editor/markdown-commands.ts`
- Modify: `src/editor/MarkdownEditor.tsx`
- Test: `tests/unit/markdown-commands.test.ts`
- Test: `tests/components/MarkdownEditor.test.tsx`

**Interfaces:**
- Produces: `MarkdownCommand` variants `{ type: 'italic' }` and `{ type: 'task' }`.
- Produces: toolbar buttons named `斜体` and `任务`.

- [ ] **Step 1: Write failing command and toolbar tests**

```ts
expect(runMarkdownCommand('文字', { from: 0, to: 2 }, { type: 'italic' })).toEqual({
  value: '*文字*', selection: { from: 1, to: 3 },
})
expect(runMarkdownCommand('任务', { from: 0, to: 2 }, { type: 'task' })).toEqual({
  value: '- [ ] 任务', selection: { from: 6, to: 8 },
})
expect(screen.getByRole('button', { name: '斜体' })).toBeEnabled()
expect(screen.getByRole('button', { name: '任务' })).toBeEnabled()
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/markdown-commands.test.ts tests/components/MarkdownEditor.test.tsx`

Expected: FAIL because the two command variants and buttons do not exist.

- [ ] **Step 3: Implement the minimal commands and toolbar entries**

```ts
case 'italic':
  return replaceSelection(value, selection, `*${selected}*`, 1, 1 + selected.length)
case 'task':
  return replaceSelection(value, selection, `- [ ] ${selected}`, 6, 6 + selected.length)
```

Add `{ label: '斜体', command: { type: 'italic' } }` and
`{ label: '任务', command: { type: 'task' } }` to the toolbar array.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/unit/markdown-commands.test.ts tests/components/MarkdownEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/markdown-commands.ts src/editor/MarkdownEditor.tsx tests/unit/markdown-commands.test.ts tests/components/MarkdownEditor.test.tsx
git commit -m "feat: add italic and task editor commands"
```

### Task 3: Clickable Task Widgets

**Files:**
- Modify: `src/editor/live-markdown.ts`
- Modify: `src/editor/MarkdownEditor.tsx`
- Modify: `src/editor/editor.css`
- Test: `tests/unit/live-markdown.test.ts`

**Interfaces:**
- Consumes: GFM syntax node `TaskMarker` containing `[ ]`, `[x]`, or `[X]`.
- Produces: `LiveMarkdownOptions.disabled: boolean`.
- Produces: checkbox widget class `.cm-md-task-checkbox`.

- [ ] **Step 1: Write failing widget tests**

Create views for `- [ ] 未完成` and `- [x] 已完成`; assert two checkboxes, checked
states `false/true`, and that clicking the first changes only its marker to `[x]`.
Create a disabled view and assert its checkbox is disabled and cannot change the document.
Create a source-mode view and assert no `.cm-md-task-checkbox` exists.

- [ ] **Step 2: Run the widget test and verify RED**

Run: `npm test -- tests/unit/live-markdown.test.ts`

Expected: FAIL because `TaskMarker` is still literal Markdown.

- [ ] **Step 3: Implement the task widget**

Add a `TaskCheckboxWidget` carrying `{ from, to, checked, disabled }`. Its checkbox
`change` handler dispatches exactly one replacement:

```ts
view.dispatch({
  changes: { from, to, insert: checkbox.checked ? '[x]' : '[ ]' },
})
```

In `buildDecorations`, replace each `TaskMarker` with the widget only in instant
mode. Pass `disabled` from `MarkdownEditor` into `liveMarkdown` and include it in
the extension memo dependencies. Add compact checkbox styles using existing IMX
color variables and a visible keyboard focus ring.

- [ ] **Step 4: Run widget and editor tests and verify GREEN**

Run: `npm test -- tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx`

Expected: PASS with exact Markdown mutation and disabled/source-mode behavior.

- [ ] **Step 5: Commit**

```bash
git add src/editor/live-markdown.ts src/editor/MarkdownEditor.tsx src/editor/editor.css tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx
git commit -m "feat: toggle Markdown tasks in the editor"
```

### Task 4: Browser Regression

**Files:**
- Modify: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Verifies: toolbar insertion, checkbox toggle in both directions, source Markdown,
  autosave status, and the preserved heading regression.

- [ ] **Step 1: Extend the existing browser test**

Use source mode to enter all six heading levels plus:

```md
- [ ] 未完成
- [x] 已完成
```

Switch to instant mode, click the unchecked widget, verify source contains
`- [x] 未完成`, click it again, and verify `- [ ] 未完成`. Assert the draft status
reaches `已保存到本地草稿` after the mutation.

- [ ] **Step 2: Run Chromium and verify the behavior**

Run: `npx playwright test tests/e2e/editor.spec.ts --project=chromium --grep 'live writing'`

Expected: PASS, including the previously failing heading underline assertion.

- [ ] **Step 3: Run complete verification**

```bash
npm run lint
npm run typecheck
npm test
npm run check:standalone
npm run build
npx playwright test tests/e2e/editor.spec.ts --grep 'live writing|authors'
git diff --check
```

Expected: all commands exit 0; the E2E selection passes in Chromium, Firefox,
and WebKit.

- [ ] **Step 4: Commit the task-list browser coverage**

```bash
git add tests/e2e/editor.spec.ts
git commit -m "test: cover interactive Markdown tasks"
```
