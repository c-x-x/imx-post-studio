# IMX Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-column IMX writing desk with an on-demand, accessible full-screen article preview.

**Architecture:** `App` owns preview lifetime and only calls `renderMarkdown` while preview is open. `PreviewFrame` remains responsible for the sandboxed IMX document and device/theme controls. Shared CSS tokens align the app shell, dashboard, inspector, editor, dialogs, and preview chrome with IMX.

**Tech Stack:** React 19, TypeScript, CodeMirror, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- Modify only `imx-post-studio`; theme and blog repositories are read-only.
- Add no runtime dependency and do not weaken iframe sandboxing.
- Do not commit, push, or deploy without explicit authorization.

---

### Task 1: Preview lifecycle

**Files:** `src/app/App.tsx`, `src/preview/PreviewFrame.tsx`, `tests/components/Workspace.test.tsx`, `tests/components/PreviewFrame.test.tsx`

**Interfaces:** `PreviewFrame` adds `onClose: () => void`; `App` exposes `预览文章` and mounts the iframe only while open.

- [x] Write tests asserting no default iframe, two workspace tabs, full-screen dialog opening, Escape close, and focus restoration.
- [x] Run the tests and observe failures against the old always-mounted preview.
- [x] Implement guarded rendering and accessible dialog lifecycle.
- [x] Re-run focused tests and verify they pass.

### Task 2: IMX visual system

**Files:** `src/app/app.css`, `src/editor/editor.css`, `src/editor/MarkdownEditor.tsx`, `src/preview/preview-frame.css`

**Interfaces:** CSS provides IMX font, paper, ink, accent, line, glass, radius, and shadow tokens; desktop grid becomes inspector plus editor.

- [x] Apply pinned IMX colors and bundled fonts to the application shell.
- [x] Build liquid-glass header and preview controls, paper cards, and a full-height editor canvas.
- [x] Add responsive two-tab workspace and automatic mobile preview sizing.
- [x] Verify desktop and 390px layouts in a real browser with no horizontal overflow.

### Task 3: Regression coverage

**Files:** `tests/e2e/editor.spec.ts`, `tests/e2e/security.spec.ts`, `tests/e2e/visual.spec.ts`

**Interfaces:** E2E flows explicitly open preview before querying its iframe; article screenshot baselines remain unchanged.

- [x] Update editor, accessibility, security, and visual flows for on-demand preview.
- [x] Verify focused component tests, lint, and typecheck.
- [x] Run all unit, build, theme-integrity, and Playwright checks.
