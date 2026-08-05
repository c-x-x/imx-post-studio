# Dirty Exit Warning and Discarded Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make home navigation immediate, warn only for revisions not yet stored locally, delete the current draft before a discard-and-new transition, and stabilize import-dialog hover hit boxes.

**Architecture:** `App` owns a clean/dirty persistence boundary and delegates native leave protection to a focused hook. The draft repository serializes writes and deletion by draft ID, while the new-article dialog pauses autosave scheduling and performs save/delete transitions explicitly. Dialog hover styling retains visual feedback without moving the clickable element.

**Tech Stack:** React 19, TypeScript 6, IndexedDB via `idb`, CSS custom properties, Vitest/Testing Library, Playwright.

## Global Constraints

- Home and Studio-brand navigation never prompts, saves, or deletes.
- A successful current autosave counts as “saved to the draft library”.
- Browser close/reload warnings use native `beforeunload` behavior only for unsaved changes.
- New-article discard is labeled exactly “删除草稿并继续”.
- A failed save or deletion never replaces the current article.
- `hugo-theme-imx` and `c-x-x.github.io` remain read-only.

---

### Task 1: Serialize draft writes and deletion

**Files:**
- Modify: `src/drafts/repository.ts`
- Test: `tests/unit/draft-repository.test.ts`

**Interfaces:**
- Preserves: `draftRepository.put(draft: ArticleDraft): Promise<void>`.
- Preserves: `draftRepository.delete(id: string): Promise<void>`.
- Produces: per-draft mutation ordering where a later delete completes after an earlier put, even when Blob serialization is delayed.

- [ ] **Step 1: Write a failing concurrent put/delete test**

Create a draft whose media Blob `arrayBuffer()` is deferred, start `put`, invoke `delete` before resolving the Blob, then resolve both operations and assert `get(id)` is `undefined`.

```ts
const bytes = deferred<ArrayBuffer>()
const delayedBlob = new NativeBlob([imageBytes], { type: 'image/png' })
vi.spyOn(delayedBlob, 'arrayBuffer').mockReturnValue(bytes.promise)
const current = draft({ id: 'delete-after-pending-put', media: [{ ...draft().media[0], blob: delayedBlob }] })
const saving = draftRepository.put(current)
const deleting = draftRepository.delete(current.id)
bytes.resolve(imageBytes.buffer.slice(0))
await Promise.all([saving, deleting])
expect(await draftRepository.get(current.id)).toBeUndefined()
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `npx vitest run tests/unit/draft-repository.test.ts`

Expected: the delayed put recreates the deleted record under the current implementation.

- [ ] **Step 3: Add a per-draft mutation queue**

Snapshot the draft immediately, then enqueue the IndexedDB write. Enqueue deletion on the same ID and continue the queue after rejected operations.

```ts
const draftMutations = new Map<string, Promise<void>>()

function enqueueDraftMutation<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = draftMutations.get(id) ?? Promise.resolve()
  const running = previous.catch(() => undefined).then(operation)
  const settled = running.then(() => undefined, () => undefined)
  draftMutations.set(id, settled)
  void settled.then(() => {
    if (draftMutations.get(id) === settled) draftMutations.delete(id)
  })
  return running
}
```

- [ ] **Step 4: Run the repository suite and verify GREEN**

Run: `npx vitest run tests/unit/draft-repository.test.ts`

Expected: all repository tests pass, including delayed put followed by delete.

- [ ] **Step 5: Commit**

```bash
git add src/drafts/repository.ts tests/unit/draft-repository.test.ts
git commit -m "fix: serialize draft deletion"
```

### Task 2: Track unsaved revisions and warn only on browser exit

**Files:**
- Create: `src/app/use-unsaved-changes-warning.ts`
- Modify: `src/app/App.tsx`
- Test: `tests/unit/use-unsaved-changes-warning.test.ts`
- Test: `tests/components/transition-recovery.test.tsx`

**Interfaces:**
- Produces: `useUnsavedChangesWarning(hasUnsavedChanges: boolean): void`.
- Produces in `App`: a clean/dirty marker set by draft mutations and cleared only by a successful current persistence operation.
- Consumes: `SaveStatus.state === 'saved'` from `useAutosave`.

- [ ] **Step 1: Write failing unload and immediate-home tests**

The hook test dispatches a cancelable `beforeunload` event and asserts dispatch is prevented only while dirty. The App test edits a title, clicks home, asserts no dialog, returns to Article, and asserts the title remains.

```ts
const event = new Event('beforeunload', { cancelable: true })
expect(window.dispatchEvent(event)).toBe(false)

fireEvent.change(screen.getByLabelText('标题'), { target: { value: '仍在内存' } })
fireEvent.click(screen.getByRole('button', { name: '首页' }))
expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: '文章' }))
expect(screen.getByLabelText('标题')).toHaveValue('仍在内存')
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/unit/use-unsaved-changes-warning.test.ts tests/components/transition-recovery.test.tsx`

Expected: the hook is missing and home still opens the save-decision dialog.

- [ ] **Step 3: Implement the warning hook and persistence boundary**

```ts
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])
}
```

In `App`, mutations and imported content set dirty; a stable `persistLatestDraft` and a successful current autosave clear dirty; opening an existing draft and creating a blank draft set clean. `showHome` directly changes `view` without using the confirmed transition.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/unit/use-unsaved-changes-warning.test.ts tests/components/transition-recovery.test.tsx tests/components/App.test.tsx`

Expected: home is immediate, in-memory content survives, and unload protection follows the dirty marker.

- [ ] **Step 5: Commit**

```bash
git add src/app/use-unsaved-changes-warning.ts src/app/App.tsx tests/unit/use-unsaved-changes-warning.test.ts tests/components/transition-recovery.test.tsx tests/components/App.test.tsx
git commit -m "feat: warn before losing unsaved changes"
```

### Task 3: Delete the current draft before creating a discarded new article

**Files:**
- Modify: `src/app/TransitionConfirmDialog.tsx`
- Modify: `src/app/App.tsx`
- Test: `tests/components/transition-recovery.test.tsx`

**Interfaces:**
- Narrows: `TransitionConfirmDialog` to the new-article decision only; removes `ConfirmedIntent` and the `intent` prop.
- Produces: `deleteAndContinueNewArticle(): Promise<void>` inside `App`.
- Consumes: serialized `draftRepository.delete(id)` from Task 1.

- [ ] **Step 1: Write failing delete-success and delete-failure tests**

Mock `draftRepository.delete`. After choosing “删除草稿并继续”, assert the outgoing draft ID is deleted before the title becomes blank. Reject deletion and assert the dialog, current ID/content, and error remain.

```ts
fireEvent.click(screen.getByRole('button', { name: '新建文章' }))
fireEvent.click(screen.getByRole('button', { name: '删除草稿并继续' }))
await waitFor(() => expect(remove).toHaveBeenCalledWith(outgoingId))
expect(screen.getByLabelText('标题')).toHaveValue('')
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/components/transition-recovery.test.tsx`

Expected: the new label is missing and the current discard path does not call repository deletion.

- [ ] **Step 3: Implement the destructive transition**

Replace the pending intent union with a boolean new-article prompt. Pause autosave input while the prompt is open. The delete handler locks transitions, awaits deletion, clears dirty state, closes the dialog, and only then creates a clean blank draft. On rejection it sets `删除草稿失败：<detail>` and keeps the dialog open.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/components/transition-recovery.test.tsx tests/components/ImxDock.test.tsx`

Expected: save, delete, cancel, failure, focus, and brand/home flows all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/TransitionConfirmDialog.tsx src/app/App.tsx tests/components/transition-recovery.test.tsx
git commit -m "feat: delete discarded drafts"
```

### Task 4: Stabilize dialog hover and complete browser regression

**Files:**
- Modify: `src/app/app.css`
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`

**Interfaces:**
- Produces: dialog buttons whose computed hover transform is `none`.
- Verifies: dirty `beforeunload` prevention survives home navigation and disappears after autosave.

- [ ] **Step 1: Add failing browser assertions**

In the verified-import dialog, hover “作为新草稿打开” and assert its computed transform remains `none`. In the Dock suite, edit a title, return home, dispatch a cancelable `beforeunload`, and assert it is prevented; return to Article, wait for autosave success, then assert a new event is not prevented.

```ts
await importAsNew.hover()
await expect(importAsNew).toHaveCSS('transform', 'none')

const mayLeave = await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))
expect(mayLeave).toBe(false)
```

- [ ] **Step 2: Run focused Chromium tests and verify RED**

Run: `npx playwright test tests/e2e/editor.spec.ts tests/e2e/dock-and-sidebar.spec.ts --project=chromium`

Expected: import-dialog hover reports a translated matrix and home navigation still follows the old confirmation flow until prior tasks are present.

- [ ] **Step 3: Keep dialog hit boxes stationary**

```css
.dialog-actions button:hover:not(:disabled) {
  transform: none;
}
```

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Run: `npm run check:theme`

Run: `npm run test:e2e`

Expected: all Vitest tests and all configured Chromium, Firefox, and WebKit tests pass; project-defined skips remain skips.

- [ ] **Step 5: Inspect and commit**

Run: `git diff --check && git status --short --branch`

```bash
git add src/app/app.css tests/e2e/editor.spec.ts tests/e2e/dock-and-sidebar.spec.ts
git commit -m "fix: stabilize dialog actions"
```
