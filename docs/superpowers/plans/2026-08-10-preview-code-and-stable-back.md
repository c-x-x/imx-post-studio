# Preview Code Blocks and Stable Back Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete preview code blocks and eliminate preview-back hover flicker while reducing low-value regression coverage.

**Architecture:** Add a post-highlight HAST transformer that emits the existing `.highlight` structure. Keep the iframe script-free and attach copy behavior from `PreviewFrame`; remove transform-based hover movement from the back control.

**Tech Stack:** React 19, TypeScript, unified/rehype, CSS, Vitest, Playwright.

## Global Constraints

- Keep the preview iframe free of embedded scripts and keep `sandbox="allow-same-origin"` unchanged.
- Reuse the existing code-block palette and IMX-style visual language.
- Add no dependencies.
- Prefer one user-flow browser test over separate visual-detail regressions.

---

### Task 1: Define the failing behavior

**Files:**
- Modify: `tests/unit/markdown-preview.test.ts`
- Modify: `tests/e2e/editor.spec.ts`
- Modify: `tests/e2e/dock-and-sidebar.spec.ts`
- Modify: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Consumes: `renderMarkdown()` output and the preview user flow.
- Produces: one unit contract for trusted code markup and one browser contract for code copying plus stable back-control geometry.

- [ ] Extend the existing highlighting unit test to require `.highlight`, `data-code-lang="typescript"`, `TypeScript`, three window dots, and `复制代码`.
- [ ] Add one browser test that previews Bash, clicks `复制`, observes `已复制`, and verifies hovering `返回编辑` does not change its bounding box.
- [ ] Run the focused tests and confirm they fail because the wrapper and copy control do not exist and hover changes geometry.
- [ ] Delete the synthetic inspector pressure test and the two component tests that assert internal Dock markup or exact CSS strings.

### Task 2: Implement the minimal preview changes

**Files:**
- Modify: `src/preview/markdown.ts`
- Modify: `src/preview/PreviewFrame.tsx`
- Modify: `src/preview/preview-frame.css`
- Modify: `src/preview/studio-preview.css`

**Interfaces:**
- Produces: `decorateCodeBlocks()` HAST transformer and iframe copy wiring scoped to `[data-copy-code]` buttons.

- [ ] Add a transformer after `rehypeHighlight` that wraps each direct `pre > code` block with the trusted header and language metadata.
- [ ] Add the missing centered language-label and copy-button styles to the existing code-block CSS.
- [ ] Wire copy buttons during the existing iframe connection step without enabling iframe scripts.
- [ ] Remove the back button's hover translation while retaining color and border feedback.
- [ ] Run the focused unit and browser tests and confirm they pass.

### Task 3: Verify and publish

**Files:**
- Modify: only the files listed above and these design/plan documents.

**Interfaces:**
- Produces: a verified commit on `main` synchronized with `origin/main`.

- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Run the relevant Chromium preview/editor browser tests.
- [ ] Run `git diff --check`, inspect the scoped diff, commit, push `main`, and confirm `HEAD` equals `origin/main`.

