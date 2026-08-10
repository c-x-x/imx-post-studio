# Shadow DOM Preview Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the preview iframe with an open Shadow DOM surface whose code-copy button works across supported browsers while preserving the existing IMX preview visuals and sanitization.

**Architecture:** `buildPreviewDocument` becomes a Shadow-DOM-safe content builder with document selector adaptation. `PreviewFrame` owns one scrollable shadow host and binds theme, directory, Dock, and copy behavior inside that root. Existing tests move from iframe traversal to Playwright's open-shadow traversal without adding duplicate journeys.

**Tech Stack:** React 19, TypeScript 6, Shadow DOM, Vitest, Testing Library, Playwright.

## Global Constraints

- Markdown sanitization remains the sole gate for article HTML.
- The Shadow DOM contains no scripts or inline event attributes.
- Preserve existing preview visuals, Dock behavior, responsive widths, theme behavior, directory following, and scroll restoration.
- Reuse existing tests and keep CI coverage lean.

---

### Task 1: Build Shadow-safe preview content

**Files:**
- Modify: `src/preview/build-preview-document.ts`
- Modify: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Consumes: `PreviewDocumentInput`.
- Produces: `buildPreviewDocument(input): string`, now returning style tags plus `.preview-html > .preview-body.is-article-page` markup suitable for `ShadowRoot.innerHTML`.

- [ ] **Step 1: Change the existing component test to require Shadow-safe wrappers, `#heading` directory links, sanitized title text, and no `html`, `body`, or `script` document tags.**

```ts
expect(content).toContain('class="preview-html" data-theme="light"')
expect(content).toContain('class="preview-body is-article-page"')
expect(content).toContain('href="#imx-heading-a"')
expect(content).not.toMatch(/<(?:html|body|script)\b/i)
```

- [ ] **Step 2: Run `npm test -- tests/components/PreviewFrame.test.tsx` and verify the new assertions fail against the full iframe document.**

- [ ] **Step 3: Add a focused CSS adapter and return Shadow-safe markup.**

```ts
function shadowCss(value: string): string {
  return safeCss(value)
    .replaceAll(':root', ':host')
    .replace(/\bhtml\s*\{/g, '.preview-html {')
    .replace(/\bbody(?=\s*[.{])/g, '.preview-body')
}
```

- [ ] **Step 4: Run the focused component test and verify it passes.**

### Task 2: Move preview behavior onto the Shadow host

**Files:**
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/preview/preview-frame.css`
- Modify: `tests/components/PreviewFrame.test.tsx`
- Modify: `tests/e2e/editor.spec.ts`

**Interfaces:**
- Produces: an open `.preview-frame[title="IMX 文章预览"]` shadow host.
- Produces: cleanup callbacks for code-copy and scroll/TOC observers.

- [ ] **Step 1: Update the existing preview component and code-block E2E tests to require a non-iframe shadow host and real Chromium/Firefox copy behavior; keep only the WebKit system-clipboard boundary substituted.**

- [ ] **Step 2: Run the focused component test and three-browser code-block journey; verify failure because the iframe still exists or copy remains broken.**

- [ ] **Step 3: Replace iframe refs with a shadow host ref, populate one open shadow root in an effect, and bind interactions after content insertion.**

```tsx
const hostRef = useRef<HTMLDivElement>(null)
const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
shadow.innerHTML = previewContent
```

- [ ] **Step 4: Change scroll tracking to read `host.scrollTop`, `host.clientHeight`, headings and directory links from the shadow root, and restore the saved host scroll position after content refresh.**

- [ ] **Step 5: Bind each `[data-copy-code]` button inside the shadow root to copy its sibling `pre code` text using `navigator.clipboard.writeText`, with a synchronous hidden-textarea fallback and existing success/error labels.**

- [ ] **Step 6: Make `.preview-frame` the full-height scroll container and retain current desktop/mobile width calculations without horizontal page overflow.**

- [ ] **Step 7: Run the focused component and three-browser code-block tests and verify they pass.**

### Task 3: Migrate existing preview assertions and verify the product

**Files:**
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `tests/e2e/security.spec.ts`
- Modify: `tests/e2e/visual.spec.ts`
- Modify: `tests/components/Workspace.test.tsx`

**Interfaces:**
- Consumes: `.preview-frame` open shadow host from Task 2.
- Produces: unchanged behavioral coverage using normal locators that pierce open Shadow DOM.

- [ ] **Step 1: Replace `frameLocator('iframe[...]')` with `.preview-frame` locators and replace iframe `srcdoc`, sandbox, and document-window assertions with Shadow host, wrapper-theme, no-script, scroll-container, and rendered-content assertions.**

- [ ] **Step 2: Run focused preview/security suites and fix only selector or scroll-measurement differences caused by the host migration.**

```bash
npx playwright test tests/e2e/editor.spec.ts tests/e2e/security.spec.ts tests/e2e/dock-and-sidebar.spec.ts --project=chromium
```

- [ ] **Step 3: Run required static and unit verification.**

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

- [ ] **Step 4: Run the existing three-browser E2E suite and confirm zero failures.**

```bash
npm run test:e2e
```

- [ ] **Step 5: Inspect the final diff, commit only the Shadow preview changes and updated existing tests, push `main`, and verify `HEAD` equals `origin/main`.**
