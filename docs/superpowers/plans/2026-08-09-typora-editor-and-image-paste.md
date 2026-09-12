# Typora-Style Editor and Image Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default Typora-style live Markdown writing mode, a complete source mode, responsive visual wrapping, and transactional clipboard-image insertion to IMX Post Studio.

**Architecture:** Keep CodeMirror as the only Markdown document and add incremental syntax-tree decorations for the writing view. Clipboard images are validated asynchronously while the workspace is locked, then body text and media assets are committed together through one reducer action; the existing full-screen article preview remains separate.

**Tech Stack:** React 19, TypeScript 6, CodeMirror 6, `@codemirror/lang-markdown`, `@codemirror/language`, `@lezer/markdown`, Vitest, Testing Library, Playwright.

## Global Constraints

- Modify only `imx-post-studio`; do not modify `hugo-theme-imx`.
- Keep Markdown as the only article source; never round-trip HTML back to Markdown.
- Default to the Typora-style `rich` mode and provide an explicit `source` mode.
- Mode changes must preserve body bytes, selection, scroll position, and CodeMirror undo history.
- Visual wrapping must never insert real newline characters.
- Render headings, strong, emphasis, strikethrough, quotes, ordered/unordered lists, links, inline code, fenced code, horizontal rules, and local images; keep tables and raw HTML as source.
- Reveal complete Markdown markers for every logical block intersecting the current selection.
- Do not change decorations while `EditorView.composing` is true.
- Plain-text paste must retain CodeMirror's default behavior.
- Clipboard images must reuse the existing MIME, byte-signature, size, safe-name, and unique-name rules.
- A pasted image batch must commit body and media together or commit neither.
- Keep existing media-panel, draft, ZIP, preview, security, and local-only behavior.
- Do not add a rich-text editor dependency or any network upload.

---

### Task 1: Source mode toggle and visual line wrapping

**Files:**
- Create: `src/editor/editor-mode.ts`
- Create: `tests/components/MarkdownEditor.test.tsx`
- Modify: `src/editor/MarkdownEditor.tsx`
- Modify: `src/editor/editor.css`

**Interfaces:**
- Produces: `export type EditorMode = 'rich' | 'source'`.
- Produces: a toolbar mode button whose `aria-pressed` value is `true` only in source mode.
- Preserves: `MarkdownEditorHandle.insertImage(name, alt)` and the current controlled `value/onChange` contract.

- [ ] **Step 1: Write failing component tests for the mode and wrapping contract**

Create real `MarkdownEditor` tests that render the component with `value="一段很长的 Markdown"`. Assert that:

```ts
const source = screen.getByRole('button', { name: '源代码' })
expect(source).toHaveAttribute('aria-pressed', 'false')
expect(document.querySelector('.cm-lineWrapping')).toBeInTheDocument()

fireEvent.click(source)
expect(screen.getByRole('button', { name: '即时排版' })).toHaveAttribute('aria-pressed', 'true')
expect(onChange).not.toHaveBeenCalled()
expect(screen.getByRole('textbox', { name: 'Markdown 编辑器' })).toHaveTextContent('一段很长的 Markdown')
```

Add a second test that types text, toggles twice, invokes undo with `Mod-z`, and expects the same undo result as before the mode changes.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- tests/components/MarkdownEditor.test.tsx`

Expected: FAIL because the mode button and `.cm-lineWrapping` do not exist.

- [ ] **Step 3: Add the display mode without replacing the editor state**

Create `editor-mode.ts` with the exact union type. In `MarkdownEditor`, store `mode` with `useState<EditorMode>('rich')`, mark the section with `data-mode={mode}`, and add the toolbar button after a flex spacer:

```tsx
<span className="editor-toolbar-spacer" aria-hidden="true" />
<button
  className="editor-mode-toggle"
  type="button"
  aria-pressed={mode === 'source'}
  onMouseDown={(event) => event.preventDefault()}
  onClick={() => setMode((current) => current === 'rich' ? 'source' : 'rich')}
>
  {mode === 'rich' ? '源代码' : '即时排版'}
</button>
```

Add `EditorView.lineWrapping` to the existing extension array. Do not key or remount `CodeMirror` on mode changes.

- [ ] **Step 4: Add responsive editor CSS**

Add `.editor-toolbar-spacer { flex: 1 1 auto; }`, keep the mode button visible at the right edge, switch the rich-mode scroller to the Studio reading font, retain monospace in source mode, and add:

```css
.markdown-editor .cm-content { overflow-wrap: anywhere; }
.markdown-editor[data-mode='source'] .cm-scroller { font-family: var(--imx-font-mono); }
```

At `max-width: 620px`, keep the format buttons horizontally scrollable without allowing the mode toggle to disappear off-screen.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/components/MarkdownEditor.test.tsx
npm run typecheck
```

Expected: both commands exit 0; toggling does not call `onChange` and the wrapping extension is present.

- [ ] **Step 6: Commit**

```bash
git add src/editor/editor-mode.ts src/editor/MarkdownEditor.tsx src/editor/editor.css tests/components/MarkdownEditor.test.tsx
git commit -m "feat: add Markdown source mode and visual wrapping"
```

### Task 2: Incremental Typora-style Markdown decorations

**Files:**
- Create: `src/editor/live-markdown.ts`
- Create: `tests/unit/live-markdown.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/editor/MarkdownEditor.tsx`
- Modify: `src/editor/editor.css`

**Interfaces:**
- Consumes: `EditorMode` from `src/editor/editor-mode.ts`.
- Produces:

```ts
export interface LiveMarkdownImage {
  alt: string
  name: string
  url: string
}

export interface LiveMarkdownOptions {
  images: ReadonlyMap<string, LiveMarkdownImage>
  mode: EditorMode
}

export function liveMarkdown(options: LiveMarkdownOptions): Extension
```

- [ ] **Step 1: Add direct syntax dependencies**

Run:

```bash
npm install @codemirror/language@^6.12.4 @lezer/markdown@^1.7.2
```

Use `markdown({ extensions: GFM })` in the editor so strikethrough and other GFM node types exist in the same syntax tree consumed by the decoration plugin.

- [ ] **Step 2: Write failing real-editor decoration tests**

Create an `EditorView` attached to a test DOM with `markdown({ extensions: GFM })` and `liveMarkdown(...)`. Use this literal document:

```md
# 标题

普通 **粗体**、*斜体*、~~删除线~~、`代码` 和 [链接](https://example.com)。

> 引用
```

Place the selection in the quote. Assert the inactive heading/paragraph DOM does not expose their Markdown marker text, and assert rendered classes `.cm-md-heading-1`, `.cm-md-strong`, `.cm-md-emphasis`, `.cm-md-strikethrough`, `.cm-md-inline-code`, `.cm-md-link`, and `.cm-md-quote` exist. Move the selection into the paragraph and assert its full marker text is visible again.

Create a source-mode editor with the same document and assert all literal markers remain visible and no `.cm-md-hidden` or image widget exists.

Add a composition test: dispatch `compositionstart`, move the selection, and assert hidden-marker ranges stay unchanged until `compositionend`.

- [ ] **Step 3: Run the decoration tests and verify RED**

Run: `npm test -- tests/unit/live-markdown.test.ts`

Expected: FAIL because `liveMarkdown` does not exist.

- [ ] **Step 4: Implement block-aware decorations**

Use `syntaxTree(view.state)` inside a `ViewPlugin`. For each selection range, resolve its syntax node and climb to the nearest logical block among `Paragraph`, `ATXHeading1` through `ATXHeading6`, `Blockquote`, `ListItem`, `FencedCode`, `HorizontalRule`, and GFM table nodes. Treat the resulting `[from, to]` ranges as active.

For inactive blocks:

- replace `HeaderMark`, `EmphasisMark`, `QuoteMark`, and list marks with `.cm-md-hidden` ranges;
- style parent ranges for headings, `StrongEmphasis`, `Emphasis`, `Strikethrough`, `InlineCode`, `FencedCode`, block quotes, list items, links, and horizontal rules;
- for links, hide `LinkMark` and `URL` while leaving label text visible;
- leave unrecognized nodes untouched.

When `mode === 'source'`, return an empty decoration set. In the plugin `update`, retain the previous decoration set while `update.view.composing` is true; otherwise rebuild only when the document, selection, viewport, mode, or image map changes.

Initially call `liveMarkdown({ mode, images: new Map() })` from `MarkdownEditor`; Task 3 replaces the empty map with the editor's current media map and Blob URL resolver without changing the decoration API.

- [ ] **Step 5: Implement a safe local-image widget**

For an inactive `Image` node, read the child `URL`. Only replace the entire node when it is exactly `images/<safe-name>` and `options.images` contains that name. Use a `WidgetType` that constructs DOM nodes directly:

```ts
const figure = document.createElement('figure')
figure.className = 'cm-md-image'
const image = document.createElement('img')
image.src = entry.url
image.alt = entry.alt
figure.append(image)
```

Do not use `innerHTML`, fetch remote URLs, or replace unresolved image references.

- [ ] **Step 6: Add Studio writing styles**

Define focused classes for heading scale, strong/emphasis, strike, quotes, lists, links, code, fences, separators, and image figures. Use Studio tokens and reading typography, but do not import or reuse full-screen preview CSS. Active blocks keep visible source markers while retaining readable text styles.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
npm test -- tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx
npm run lint
npm run typecheck
```

Expected: all commands exit 0; the test DOM proves marker reveal/hide, source mode, composition stability, and safe local-image replacement.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/editor/live-markdown.ts src/editor/MarkdownEditor.tsx src/editor/editor.css tests/unit/live-markdown.test.ts tests/components/MarkdownEditor.test.tsx
git commit -m "feat: add incremental Markdown writing decorations"
```

### Task 3: Transactional clipboard-image insertion

**Files:**
- Modify: `src/media/names.ts`
- Modify: `src/editor/markdown-commands.ts`
- Modify: `src/editor/MarkdownEditor.tsx`
- Modify: `src/app/app-state.ts`
- Modify: `src/app/App.tsx`
- Modify: `tests/unit/media-names.test.ts`
- Modify: `tests/unit/markdown-commands.test.ts`
- Modify: `tests/unit/app-state-imports.test.ts`
- Modify: `tests/components/MarkdownEditor.test.tsx`
- Modify: `tests/components/Workspace.test.tsx`

**Interfaces:**
- Produces:

```ts
export function mediaAlt(name: string): string

export interface MarkdownImageInput {
  alt: string
  name: string
}

export function insertMarkdownImages(
  value: string,
  selection: MarkdownSelection,
  images: MarkdownImageInput[],
): MarkdownEdit

export interface PastedImageRequest {
  files: File[]
  selection: MarkdownSelection
  value: string
}
```

- Extends `AppAction` with:

```ts
{ type: 'paste-body-media'; assets: MediaAsset[]; body: string }
```

- [ ] **Step 1: Write failing pure transaction tests**

Add literal tests proving `mediaAlt('pei-zhi-tu.png') === 'pei zhi tu'` and an empty/unsafe base falls back to `image`.

Add `insertMarkdownImages` tests for insertion at the middle of a paragraph and replacement of a selection. For two images, expect exactly:

```md
正文前

![第一张](images/first.png)

![第二张](images/second.webp)

正文后
```

Assert the returned selection collapses after the inserted block and no extra leading/trailing blank paragraph is created at document boundaries.

Add a reducer test starting from a draft with one media asset. Dispatch `paste-body-media` and assert one next state contains both the new body and all new assets, while the previous state remains unchanged.

- [ ] **Step 2: Run the pure tests and verify RED**

Run:

```bash
npm test -- tests/unit/media-names.test.ts tests/unit/markdown-commands.test.ts tests/unit/app-state-imports.test.ts
```

Expected: FAIL because the three new APIs/action do not exist.

- [ ] **Step 3: Implement the pure naming, insertion, and reducer transaction**

Move the current filename-to-alt behavior from `App.tsx` into `mediaAlt`. Implement `insertMarkdownImages` with blank-line normalization around the selection and `![alt](images/name)` references in input order. Add the reducer branch:

```ts
case 'paste-body-media':
  return {
    ...touched(state),
    body: action.body,
    media: [...state.media, ...action.assets.map((asset) => ({ ...asset }))],
  }
```

- [ ] **Step 4: Write failing editor paste tests**

Render `MarkdownEditor` with `preparePastedImages` and `onCommitPastedImages` spies. Dispatch a real `ClipboardEvent('paste')` on `.cm-content` with:

1. `text/plain` only: assert `defaultPrevented === false` and neither callback runs.
2. one PNG file: assert default is prevented, the preparation callback receives that file, and the commit callback receives both the prepared asset and the complete next Markdown.
3. two files: assert input order and one commit.
4. rejected preparation: assert no commit and the editor body/selection are unchanged.

- [ ] **Step 5: Run the editor paste tests and verify RED**

Run: `npm test -- tests/components/MarkdownEditor.test.tsx`

Expected: FAIL because the editor does not intercept clipboard images or expose paste callbacks.

- [ ] **Step 6: Implement the editor paste event and annotated transaction**

Extend `MarkdownEditorProps` with:

```ts
media: MediaAsset[]
preparePastedImages?: (request: PastedImageRequest) => Promise<MediaAsset[]>
onCommitPastedImages?: (assets: MediaAsset[], body: string) => void
resolveMediaUrl?: (asset: MediaAsset) => string
```

Use `EditorView.domEventHandlers({ paste(event, view) { ... } })`. Extract only clipboard entries whose MIME starts with `image/`; return `false` for zero images. For image paste, prevent default, capture the document and selection, await preparation, confirm the editor still holds the captured document, build `insertMarkdownImages`, dispatch one CodeMirror transaction, and invoke `onCommitPastedImages` once.

Define `const pastedImageTransaction = Annotation.define<boolean>()`, dispatch with `annotations: pastedImageTransaction.of(true)`, and make the controlled `onChange` handler ignore only a transaction carrying that annotation, because the App reducer receives the same body through `paste-body-media`. Catch preparation rejection, leave document and selection unchanged, and refocus the editor after success or failure.

- [ ] **Step 7: Integrate validation and atomic commit in App**

Add an `editorMediaError` state and include it in the existing Notifications alert list. Implement `preparePastedImages` in `App`:

1. synchronously set the `body` intake source busy;
2. call `prepareBodyMediaBatch(request.files, new Set(['cover.webp', ...draftRef.current.media.map(({ name }) => name)]))`;
3. verify `draftRef.current.id` still matches the captured draft;
4. return the prepared assets or set `editorMediaError` and return an empty array;
5. clear the busy source in `finally`.

Pass current body media and `urls.current.get(asset)` to the editor. Implement `onCommitPastedImages` as one `dispatchDraft({ type: 'paste-body-media', assets, body })` call. Keep the existing MediaPanel intake unchanged; both entry points continue using `prepareBodyMediaBatch`.

- [ ] **Step 8: Add App-level transaction coverage and verify GREEN**

In `Workspace.test.tsx`, paste a valid PNG into the Markdown textbox and assert the same rendered App state contains a media-list item and the source-mode Markdown reference. Paste an invalid PNG and assert the global alert appears while neither media nor body changes.

Run:

```bash
npm test -- tests/unit/media-names.test.ts tests/unit/markdown-commands.test.ts tests/unit/app-state-imports.test.ts tests/components/MarkdownEditor.test.tsx tests/components/Workspace.test.tsx
npm run typecheck
```

Expected: all tests pass; text paste is unmodified, valid image batches commit once, and invalid batches commit nothing.

- [ ] **Step 9: Commit**

```bash
git add src/media/names.ts src/editor/markdown-commands.ts src/editor/MarkdownEditor.tsx src/app/app-state.ts src/app/App.tsx tests/unit/media-names.test.ts tests/unit/markdown-commands.test.ts tests/unit/app-state-imports.test.ts tests/components/MarkdownEditor.test.tsx tests/components/Workspace.test.tsx
git commit -m "feat: paste clipboard images into Markdown"
```

### Task 4: Browser acceptance, documentation, and full regression

**Files:**
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete browser path from clipboard image to media, Markdown, live image, export, and re-import.

- [ ] **Step 1: Add failing cross-browser live-writing acceptance tests**

In `editor.spec.ts`, open an article containing heading, strong, emphasis, strikethrough, quote, list, link, inline code, fenced code, horizontal rule, and a long single-line paragraph. Assert in rich mode that the corresponding `.cm-md-*` elements are visible and inactive markers are hidden. Focus the long paragraph and verify markers return.

Measure the long paragraph's rendered height in rich mode at 1440px, resize to 760px and then 390px, and assert the height grows without horizontal page overflow. Toggle to source mode before and after the resize sequence to read and compare the complete raw Markdown, then assert:

```ts
expect(narrowLineHeight).toBeGreaterThan(wideLineHeight)
expect(markdownAfterResize).toBe(markdownBeforeResize)
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
```

Toggle source mode, assert complete literal markers are present, undo and redo an edit across two mode changes, and verify the expected body text.

- [ ] **Step 2: Add failing cross-browser clipboard-image acceptance**

Dispatch a paste event on `.cm-content` with a real PNG `File` and `DataTransfer`. Assert the media list contains `image.png`, rich mode shows `.cm-md-image img[src^="blob:"]`, and source mode contains `![image](images/image.png)`.

Extend the existing export/re-import workflow to use that pasted image and confirm the re-imported draft still renders the Blob image. Repeat with two same-name images and expect `image.png` plus `image-2.png` in order.

- [ ] **Step 3: Run the focused E2E tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/editor.spec.ts tests/e2e/dock-and-sidebar.spec.ts --project=chromium --grep "live writing|clipboard image|visual wrapping"
```

Expected: FAIL before the complete browser integration exists.

- [ ] **Step 4: Finish browser-specific fixes without changing the contract**

Address only evidence from the focused failures: CodeMirror composition timing, selection restoration, DataTransfer differences, mobile toolbar layout, or image-widget sizing. Do not add table WYSIWYG, raw-HTML rendering, remote image fetches, or a second preview pane.

- [ ] **Step 5: Update README**

Document the default即时排版 mode, source-mode toggle, visual-only line wrapping, direct clipboard-image paste, transaction failure behavior, and the distinction between writing effects and the full-screen IMX article preview.

- [ ] **Step 6: Run full verification**

```bash
npm run lint
npm run typecheck
npm test
npm run check:standalone
npm run build
npm run test:e2e
git diff --check
git status --short --branch
git -C /Users/cb/Documents/Codex/test0/hugo-theme-imx status --short --branch
```

Expected: lint, typecheck, all Vitest files, standalone verification, production build, and all applicable Chromium/Firefox/WebKit tests pass; Studio has only intentional commits; `hugo-theme-imx` remains clean.

- [ ] **Step 7: Commit verification and docs**

```bash
git add README.md tests/e2e/editor.spec.ts tests/e2e/dock-and-sidebar.spec.ts
git commit -m "test: cover live writing and clipboard image flow"
```
