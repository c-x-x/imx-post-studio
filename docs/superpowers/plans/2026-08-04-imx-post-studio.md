# IMX Post Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, publish, and deploy a browser-only IMX article editor that produces Hugo-compatible leaf-bundle ZIP files and shows a high-fidelity IMX article preview.

**Architecture:** A React, TypeScript, and Vite SPA owns one canonical article model. Focused metadata, media, bundle, draft, editor, and preview modules exchange typed values; all article data stays in the browser, with IndexedDB persistence and ZIP portability. The production build is static, GitHub Actions performs quality checks, and Vercel Git Integration deploys `main`.

**Tech Stack:** React, TypeScript, Vite, CodeMirror 6, unified/remark/rehype, `@zip.js/zip.js`, IndexedDB via `idb`, `smol-toml`, `pinyin-pro`, React Easy Crop, Vitest, Testing Library, Playwright, ESLint, GitHub Actions, Vercel.

## Global Constraints

- Work only in `/Users/cb/Documents/Codex/test0/imx-post-studio`; treat `hugo-theme-imx` and `c-x-x.github.io` as read-only inputs.
- Runtime architecture is static and browser-only: no API routes, database, analytics, GitHub credentials, Vercel credentials, or automatic cross-device sync.
- Generate `<slug>/index.md` and `<slug>/images/*`; body references use `images/<name>`, while the cover field uses `/posts/<slug>/images/cover.webp`.
- New articles default to `draft = true`; dates default to RFC 3339 with `+08:00`.
- Accept JPEG, PNG, WebP, and GIF body images; reject SVG; convert cover JPEG/PNG/WebP to a maximum 1600 by 900 WebP at quality 82 without upscaling.
- Limit one source file to 25 MiB and ZIP import to 500 entries, 25 MiB per uncompressed file, and 250 MiB total uncompressed size.
- Preview imported Markdown only after sanitization and inside a sandboxed iframe with no script permission.
- Pin the IMX preview snapshot to v1.4.9 commit `6f08e8e`; preserve its MIT license and file hashes.
- Pin installed dependencies through `package-lock.json`; load no dependency from a CDN at runtime.
- Use TDD for domain behavior, run proportional browser verification for UI behavior, and commit after each task.
- Keep generated Hugo output, caches, and release-verification copies under `/tmp`.

---

## File Map

- `src/app/*`: shell, reducer, responsive workspace, notifications.
- `src/metadata/*`: canonical article types, slug logic, TOML, metadata form.
- `src/editor/*`: CodeMirror and pure Markdown insertion commands.
- `src/media/*`: names, references, image conversion, object URLs, crop and media UI.
- `src/shared/limits.ts`: upload and archive resource limits shared by media and bundles.
- `src/bundles/*`: archive limits, path safety, import/export, bundle dialogs.
- `src/drafts/*`: IndexedDB, repository, autosave, draft dashboard.
- `src/preview/*`: sanitized Markdown, TOC, iframe document, viewport controls.
- `src/theme/imx/*` and `public/imx/fonts/*`: pinned IMX preview snapshot and license.
- `scripts/*`: theme synchronization, manifest verification, Hugo release bundle.
- `tests/unit/*`, `tests/components/*`, `tests/e2e/*`: behavior, UI, security, and visual proof.
- `.github/*`, `vercel.json`, `README.md`, `LICENSE`: delivery and maintenance.

---

### Task 1: Scaffold the Typed Static Application and Test Harness

**Files:**
- Create: `package.json`, `package-lock.json`, `index.html`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`
- Create: `src/vite-env.d.ts`, `src/main.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Create: `tests/setup.ts`
- Test: `tests/components/App.test.tsx`

**Interfaces:**
- Consumes: approved design only.
- Produces: `App(): JSX.Element`, Vite build, Vitest `jsdom` environment, and standard scripts used by every later task.

- [ ] **Step 1: Initialize package metadata and install dependencies**

```bash
npm init -y
npm pkg set name=imx-post-studio private=true type=module
npm pkg set scripts.dev="vite" scripts.build="tsc -b && vite build" scripts.preview="vite preview" scripts.lint="eslint ." scripts.typecheck="tsc -b --pretty false" scripts.test="vitest run" scripts.test:watch="vitest" scripts.test:e2e="playwright test" scripts.check:theme="node scripts/verify-theme-manifest.mjs"
npm install react react-dom @uiw/react-codemirror @codemirror/lang-markdown @codemirror/commands @zip.js/zip.js idb smol-toml pinyin-pro react-easy-crop unified remark-parse remark-gfm remark-rehype rehype-raw rehype-sanitize rehype-slug rehype-highlight rehype-stringify github-slugger mdast-util-to-string unist-util-visit
npm install -D typescript tsx vite @vitejs/plugin-react eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb @playwright/test @axe-core/playwright
```

Expected: the lockfile pins every package and `package.json` contains no runtime CDN or credential.

- [ ] **Step 2: Write the failing shell test**

Create `tests/components/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app/App'

describe('App', () => {
  it('identifies the local-only IMX writing workspace', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'IMX Post Studio' })).toBeInTheDocument()
    expect(screen.getByText('文章和图片仅在此浏览器中处理')).toBeInTheDocument()
  })
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Verify the test fails**

Run `npm test -- tests/components/App.test.tsx`.

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 4: Create the minimal configured application**

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <h1>IMX Post Studio</h1>
      <p>文章和图片仅在此浏览器中处理</p>
    </main>
  )
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

Configure Vite with `react()`, Vitest with `environment: 'jsdom'` and `setupFiles: ['./tests/setup.ts']`, strict TypeScript project references, and flat ESLint rules for TypeScript and React hooks. `index.html` has `lang="zh-CN"`, viewport metadata, title, and one `#root`.

- [ ] **Step 5: Run foundation checks**

```bash
npm run lint
npm run typecheck
npm test -- tests/components/App.test.tsx
npm run build
```

Expected: all exit 0 and `dist/index.html` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json index.html tsconfig*.json vite.config.ts vitest.config.ts eslint.config.js src tests/setup.ts tests/components/App.test.tsx
git commit -m "chore: scaffold IMX Post Studio"
```

---

### Task 2: Define Article Metadata, Slugs, and TOML Round Trips

**Files:**
- Create: `src/metadata/article.ts`
- Create: `src/metadata/slug.ts`
- Create: `src/metadata/frontmatter.ts`
- Test: `tests/unit/slug.test.ts`
- Test: `tests/unit/frontmatter.test.ts`

**Interfaces:**
- Consumes: browser `crypto.randomUUID()` and `pinyin-pro`.
- Produces: `ArticleDraft`, `ArticleMeta`, `MediaAsset`, `createArticleDraft()`, `suggestSlug()`, `validateSlug()`, `serializeArticle()`, and `parseArticle()`.

- [ ] **Step 1: Write failing slug and Front Matter tests**

`tests/unit/slug.test.ts` includes:

```ts
expect(suggestSlug('Hugo 图片处理指南')).toBe('hugo-tu-pian-chu-li-zhi-nan')
expect(validateSlug('valid-post').ok).toBe(true)
for (const value of ['My Post', '中文', '-bad', 'bad-', 'bad--slug']) {
  expect(validateSlug(value).ok).toBe(false)
}
```

`tests/unit/frontmatter.test.ts` creates a draft whose title contains quotes, has Chinese arrays, a `+08:00` date, cover, and Markdown. Assert fixed key order, LF endings, and `parseArticle(serializeArticle(draft))` equivalence. A second input uses `date = 2026-06-13` and must normalize to `2026-06-13T00:00:00+08:00`.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/slug.test.ts tests/unit/frontmatter.test.ts`.

Expected: FAIL because metadata modules do not exist.

- [ ] **Step 3: Implement canonical types and defaults**

Create these public contracts in `src/metadata/article.ts`:

```ts
export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
export type MediaKind = 'cover' | 'body'

export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  mime: MediaMime
  blob: Blob
  width?: number
  height?: number
}

export interface ArticleMeta {
  title: string
  slug: string
  date: string
  draft: boolean
  categories: string[]
  tags: string[]
  description: string
  toc: boolean
}

export interface ArticleDraft {
  id: string
  createdAt: string
  updatedAt: string
  meta: ArticleMeta
  body: string
  media: MediaAsset[]
}

export function createArticleDraft(now = new Date()): ArticleDraft
```

The default has unique ID, `+08:00` time, `draft: true`, `toc: true`, and empty content arrays.

- [ ] **Step 4: Implement slug behavior**

```ts
import { pinyin } from 'pinyin-pro'

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function suggestSlug(title: string): string {
  return pinyin(title, { toneType: 'none', type: 'array' })
    .join(' ')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function validateSlug(slug: string) {
  return VALID_SLUG.test(slug)
    ? { ok: true as const }
    : { ok: false as const, message: 'Slug 只能包含小写英文、数字和单个连字符' }
}
```

- [ ] **Step 5: Implement deterministic TOML**

Export:

```ts
export interface ParsedArticle {
  meta: ArticleMeta
  body: string
  coverPath?: string
}

export function serializeArticle(draft: ArticleDraft, draftOverride?: boolean): string
export function parseArticle(source: string): ParsedArticle
```

Use `smol-toml` for parsing, a strict `+++` delimiter parser, `JSON.stringify()` for TOML basic strings, and fixed key order. Accept date-only TOML and RFC 3339 strings. Reject invalid known-field types and invalid cover paths. Preserve imported body text after normalizing line endings.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- tests/unit/slug.test.ts tests/unit/frontmatter.test.ts
npm run typecheck
git add src/metadata tests/unit/slug.test.ts tests/unit/frontmatter.test.ts
git commit -m "feat: add article metadata model"
```

### Task 3: Implement Safe Media Names, References, and Cover Processing

**Files:**
- Create: `src/media/names.ts`, `src/media/references.ts`
- Create: `src/media/cover.ts`, `src/media/object-urls.ts`
- Create: `src/shared/limits.ts`
- Test: `tests/unit/media-names.test.ts`, `tests/unit/media-references.test.ts`
- Test: `tests/unit/cover.test.ts`

**Interfaces:**
- Consumes: `MediaAsset`.
- Produces: shared exact limits, `safeMediaName()`, `uniqueMediaName()`, `findImageReferences()`, `validateMediaReferences()`, `renderCover()`, and `ObjectUrlRegistry`.

- [ ] **Step 1: Write failing pure media tests**

Cover these exact cases:

```ts
expect(safeMediaName('配置 截图 01.PNG')).toBe('pei-zhi-jie-tu-01.png')
expect(uniqueMediaName('image.png', new Set(['image.png']))).toBe('image-2.png')
expect(findImageReferences('![图](images/a.png)')).toEqual(['images/a.png'])
expect(validateMediaReferences('![图](images/missing.png)', [])).toEqual({
  missing: ['images/missing.png'],
  unused: [],
})
```

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/media-names.test.ts tests/unit/media-references.test.ts`.

Expected: FAIL because media modules do not exist.

- [ ] **Step 3: Implement safe names and reference analysis**

Create shared limits first:

```ts
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 500
export const MAX_ARCHIVE_FILE_BYTES = 25 * 1024 * 1024
export const MAX_ARCHIVE_TOTAL_BYTES = 250 * 1024 * 1024
```

`safeMediaName()` splits the final extension, converts the base with pinyin/ASCII slug rules, preserves only `jpg`, `jpeg`, `png`, `webp`, or `gif`, maps `jpeg` to `jpg`, and falls back to `image`. `uniqueMediaName()` adds `-2`, `-3`, and higher suffixes before the extension.

Parse Markdown image nodes with `remark-parse` and `unist-util-visit`. Return normalized local references beginning with `images/`; keep HTTP(S), data, and root-relative paths external. Export:

```ts
export function findImageReferences(markdown: string): string[]
export function validateMediaReferences(
  markdown: string,
  media: MediaAsset[],
): { missing: string[]; unused: string[] }
```

- [ ] **Step 4: Write the failing cover conversion unit test**

Stub `createImageBitmap`, the canvas 2D context, and `canvas.toBlob()` with deterministic dimensions and bytes. Call `renderCover()` for a decoded 2000 by 1200 source and assert:

```ts
expect(result.blob.type).toBe('image/webp')
expect(result.width).toBe(1600)
expect(result.height).toBe(900)
expect(result.blob.size).toBeGreaterThan(0)
```

Add a decoded 640 by 360 case and assert it stays 640 by 360. Task 8 repeats conversion in real Chromium without stubs.

- [ ] **Step 5: Implement cover processing and object URL cleanup**

```ts
export interface NormalizedCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderedCover {
  blob: Blob
  width: number
  height: number
}

export async function renderCover(
  source: Blob,
  crop: NormalizedCrop,
): Promise<RenderedCover>
```

Validate MIME and 25 MiB size, decode with `createImageBitmap`, clamp crop, calculate a 16:9 destination no larger than 1600 by 900, draw to canvas, encode with `canvas.toBlob('image/webp', 0.82)`, close the bitmap, and throw a Chinese actionable error on failure.

`ObjectUrlRegistry` exposes `get(asset)`, `revoke(id)`, and `dispose()`; it returns stable URLs per media ID and revokes replaced or removed blobs.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- tests/unit/media-names.test.ts tests/unit/media-references.test.ts tests/unit/cover.test.ts
npm run typecheck
git add src/media src/shared/limits.ts tests/unit/media-*.test.ts tests/unit/cover.test.ts
git commit -m "feat: add safe article media processing"
```

---

### Task 4: Build Transactional Hugo ZIP Import and Export

**Files:**
- Create: `src/bundles/archive-path.ts`
- Create: `src/bundles/export-bundle.ts`, `src/bundles/import-bundle.ts`
- Test: `tests/unit/archive-path.test.ts`
- Test: `tests/unit/bundle-roundtrip.test.ts`, `tests/unit/bundle-security.test.ts`

**Interfaces:**
- Consumes: `ArticleDraft`, `serializeArticle()`, `parseArticle()`, shared limits, and reference validation.
- Produces: `exportArticleBundle()`, `importArticleBundle()`, and `importLooseArticle()`.

- [ ] **Step 1: Write failing security and round-trip tests**

Create a draft with slug `imx-test`, `cover.webp`, `diagram.png`, and `![图](images/diagram.png)`. Assert:

```ts
const zip = await exportArticleBundle(draft, { production: true, publish: true })
const imported = await importArticleBundle(zip)
expect(imported.meta.slug).toBe('imx-test')
expect(imported.meta.draft).toBe(false)
expect(imported.body).toContain('images/diagram.png')
expect(await imported.media[1].blob.arrayBuffer()).toEqual(
  await draft.media[1].blob.arrayBuffer(),
)
```

Create malicious entries named `../escape.md`, `/absolute/index.md`, and `post/../../escape.md`; assert each rejects. Add archive cases for 501 entries, one declared 26 MiB entry, and a declared total above 250 MiB.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/archive-path.test.ts tests/unit/bundle-roundtrip.test.ts tests/unit/bundle-security.test.ts`.

Expected: FAIL because bundle modules do not exist.

- [ ] **Step 3: Implement safe archive paths using shared limits**

Import all four constants from `src/shared/limits.ts`. `validateArchivePath()` rejects empty segments, backslashes, drive prefixes, leading slashes, `.` and `..`, NUL characters, and normalized paths outside one root article directory.

- [ ] **Step 4: Implement deterministic export**

```ts
export interface ExportOptions {
  production: boolean
  publish: boolean
}

export async function exportArticleBundle(
  draft: ArticleDraft,
  options: ExportOptions,
): Promise<Blob>
```

Validate metadata and media before opening a Zip.js `ZipWriter`. Add `<slug>/index.md` first and media sorted by name under `<slug>/images/`. Close the writer in `finally`. Do not mutate draft state.

- [ ] **Step 5: Implement transactional import**

```ts
export async function importArticleBundle(blob: Blob): Promise<ArticleDraft>
export async function importLooseArticle(indexFile: File, images: File[]): Promise<ArticleDraft>
```

Use `ZipReader.getEntries()` to inspect names and declared sizes before reading bodies. Require exactly one `index.md` below one root. Reject unsafe and unsupported entries. Parse metadata, validate root slug, load supported images, map the cover to `kind: 'cover'`, validate references, and return only after all checks pass.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- tests/unit/archive-path.test.ts tests/unit/bundle-roundtrip.test.ts tests/unit/bundle-security.test.ts
npm run typecheck
git add src/bundles tests/unit/archive-path.test.ts tests/unit/bundle-*.test.ts
git commit -m "feat: add Hugo article bundle import and export"
```

### Task 5: Persist Multiple Drafts with Observable Autosave

**Files:**
- Create: `src/drafts/database.ts`, `src/drafts/repository.ts`, `src/drafts/use-autosave.ts`
- Test: `tests/unit/draft-repository.test.ts`
- Test: `tests/components/use-autosave.test.tsx`

**Interfaces:**
- Consumes: complete `ArticleDraft` values, including Blob media.
- Produces: `draftRepository`, `useAutosave()`, and `SaveStatus`.

- [ ] **Step 1: Write failing storage and autosave tests**

Use `fake-indexeddb/auto`. Verify create, replace, newest-first list, duplicate with new IDs, rename, delete, and Blob-byte preservation. Use fake timers to assert no save at 799 ms and one save at 800 ms after the last change. Force repository rejection and assert status becomes `failed` with an emergency-export message.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/draft-repository.test.ts tests/components/use-autosave.test.tsx`.

Expected: FAIL because draft storage does not exist.

- [ ] **Step 3: Implement typed IndexedDB CRUD**

Create version 1 database `imx-post-studio` with `drafts` keyed by `id` and an `updatedAt` index. Export:

```ts
export const draftRepository: {
  get(id: string): Promise<ArticleDraft | undefined>
  list(): Promise<ArticleDraft[]>
  put(draft: ArticleDraft): Promise<void>
  duplicate(id: string): Promise<ArticleDraft>
  rename(id: string, title: string): Promise<ArticleDraft>
  delete(id: string): Promise<void>
}
```

Use IndexedDB structured cloning for image blobs; never base64-encode them.

- [ ] **Step 4: Implement 800 ms observable autosave**

```ts
export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'failed'; message: string }

export function useAutosave(draft: ArticleDraft | null): SaveStatus
```

Reset the timer for each change, cancel on unmount or draft switch, ignore stale promise completions with a generation counter, and retain failure until a later successful save.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/unit/draft-repository.test.ts tests/components/use-autosave.test.tsx
npm run typecheck
git add src/drafts tests/unit/draft-repository.test.ts tests/components/use-autosave.test.tsx
git commit -m "feat: add local draft persistence"
```

---

### Task 6: Synchronize IMX Assets and Render Sanitized Preview HTML

**Files:**
- Create: `scripts/sync-imx-theme.mjs`, `scripts/verify-theme-manifest.mjs`
- Create: `src/theme/imx/imx-preview.css`, `src/theme/imx/theme-manifest.json`, `src/theme/imx/LICENSE.imx`
- Create: `public/imx/fonts/*`
- Create: `src/preview/toc.ts`, `src/preview/markdown.ts`
- Create: `src/preview/build-preview-document.ts`, `src/preview/PreviewFrame.tsx`
- Test: `tests/unit/theme-manifest.test.ts`, `tests/unit/markdown-preview.test.ts`
- Test: `tests/components/PreviewFrame.test.tsx`

**Interfaces:**
- Consumes: article metadata, Markdown, `ObjectUrlRegistry`, and read-only IMX theme path.
- Produces: verified IMX snapshot, `renderMarkdown()`, `buildPreviewDocument()`, and `PreviewFrame`.

- [ ] **Step 1: Write failing manifest and sanitized renderer tests**

Assert the manifest repository is `https://github.com/c-x-x/hugo-theme-imx`, version `v1.4.9`, commit `6f08e8e`, and every SHA-256 hash matches. Markdown cases assert GFM table, stable duplicate heading IDs, nested TOC, fenced-code language class, local-image URL rewriting, removal of `<script>` and `onclick`, and rejection of `javascript:` URLs.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/theme-manifest.test.ts tests/unit/markdown-preview.test.ts tests/components/PreviewFrame.test.tsx`.

Expected: FAIL because theme and preview modules do not exist.

- [ ] **Step 3: Implement explicit read-only IMX synchronization**

Use this allowlist:

```js
const cssFiles = [
  'assets/css/tokens.css',
  'assets/css/base.css',
  'assets/css/layout.css',
  'assets/css/cards.css',
  'assets/css/article.css',
  'assets/css/responsive-content.css',
  'assets/css/article-reading.css',
  'assets/css/article-reading-responsive.css',
  'assets/css/code.css',
]

const fontFiles = [
  'assets/fonts/imx/inter-variable.woff2',
  'assets/fonts/imx/noto-serif-sc-400-core.woff2',
  'assets/fonts/imx/noto-serif-sc-400-common.woff2',
  'assets/fonts/imx/noto-serif-sc-400-extended.woff2',
  'assets/fonts/imx/noto-serif-sc-700-core.woff2',
  'assets/fonts/imx/noto-serif-sc-700-common.woff2',
  'assets/fonts/imx/noto-serif-sc-700-extended.woff2',
]
```

The script accepts a source directory, reads tag and commit with `git -C`, requires first baseline commit `6f08e8e`, copies license/fonts, prepends concrete `@font-face` rules using `/imx/fonts/<file>`, concatenates CSS in allowlist order, and writes source paths and hashes to the manifest. It never writes inside the source.

```bash
npm pkg set scripts.sync:imx="node scripts/sync-imx-theme.mjs"
npm run sync:imx -- /Users/cb/Documents/Codex/test0/hugo-theme-imx
```

Expected: only the new repository changes and both source repositories stay clean.

- [ ] **Step 4: Implement Markdown rendering and TOC**

```ts
export interface TocItem {
  id: string
  depth: number
  text: string
  children: TocItem[]
}

export interface RenderedMarkdown {
  html: string
  toc: TocItem[]
  wordCount: number
  readingMinutes: number
}

export async function renderMarkdown(
  markdown: string,
  resolveLocalImage: (path: string) => string | undefined,
): Promise<RenderedMarkdown>
```

Use unified with remark parse/GFM/rehype, raw HTML parsing, strict sanitization, heading slugs, syntax highlighting, and HTML serialization. A focused plugin rewrites only normalized `images/<name>` sources returned by the resolver. Use `github-slugger` consistently for content and TOC duplicate IDs.

- [ ] **Step 5: Implement the sandboxed IMX document**

`buildPreviewDocument()` has this contract:

```ts
export interface PreviewDocumentInput {
  meta: ArticleMeta
  rendered: RenderedMarkdown
  css: string
  theme: 'light' | 'dark'
}

export function buildPreviewDocument(input: PreviewDocumentInput): string
```

It returns `<!doctype html>` containing synchronized CSS and IMX classes `article-page`, `article-header`, `article-meta`, `article-tags`, `layout-with-sidebar`, `article-content`, and `toc`. Include static SVG symbols for calendar, folder, clock, and menu but no scripts.

`PreviewFrame` renders:

```tsx
<iframe
  title="IMX 文章预览"
  sandbox=""
  referrerPolicy="no-referrer"
  srcDoc={documentHtml}
/>
```

Expose light/dark and desktop/mobile controls outside the iframe. Mark word count and reading time as estimates.

- [ ] **Step 6: Verify and commit**

```bash
npm run check:theme
npm test -- tests/unit/theme-manifest.test.ts tests/unit/markdown-preview.test.ts tests/components/PreviewFrame.test.tsx
npm run typecheck
git add package.json package-lock.json scripts src/preview src/theme public/imx tests/unit/theme-manifest.test.ts tests/unit/markdown-preview.test.ts tests/components/PreviewFrame.test.tsx
git commit -m "feat: add high-fidelity IMX preview"
```

### Task 7: Integrate Metadata, Markdown, Media, Draft, and Bundle UI

**Files:**
- Create: `src/app/app-state.ts`, `src/app/notifications.tsx`
- Modify: `src/app/App.tsx`, `src/app/app.css`
- Create: `src/metadata/MetadataPanel.tsx`
- Create: `src/editor/markdown-commands.ts`, `src/editor/MarkdownEditor.tsx`, `src/editor/editor.css`
- Create: `src/media/MediaPanel.tsx`, `src/media/CoverCropDialog.tsx`
- Create: `src/drafts/DraftDashboard.tsx`, `src/bundles/BundleActions.tsx`
- Test: `tests/unit/markdown-commands.test.ts`
- Test: `tests/components/MetadataPanel.test.tsx`, `tests/components/Workspace.test.tsx`

**Interfaces:**
- Consumes: every domain service from Tasks 2 through 6.
- Produces: complete user-visible authoring workflow with one reducer-owned `ArticleDraft`.

- [ ] **Step 1: Write failing command and workspace tests**

Test pure commands for wrapping a selection with `**`, inserting a heading, list, quote, fenced code, link, and `![alt](images/name.png)` at the cursor. Render the workspace and assert metadata changes update preview title, Chinese title proposes but does not force slug, imported media appears, and invalid slug disables production export with the exact validation message.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/markdown-commands.test.ts tests/components/MetadataPanel.test.tsx tests/components/Workspace.test.tsx`.

Expected: FAIL because integrated components do not exist.

- [ ] **Step 3: Implement the canonical reducer**

```ts
export type AppAction =
  | { type: 'new'; draft: ArticleDraft }
  | { type: 'replace'; draft: ArticleDraft }
  | { type: 'set-meta'; field: keyof ArticleMeta; value: ArticleMeta[keyof ArticleMeta] }
  | { type: 'set-body'; body: string }
  | { type: 'add-media'; asset: MediaAsset }
  | { type: 'replace-cover'; asset: MediaAsset }
  | { type: 'remove-media'; id: string }

export function appReducer(state: ArticleDraft, action: AppAction): ArticleDraft
```

Every mutating action updates `updatedAt`. Slug suggestion is an explicit UI action; reducer updates never overwrite a manual slug.

- [ ] **Step 4: Implement metadata and Markdown editing**

`MetadataPanel` has labeled controls for every field, tag/category chip entry, inline validation, and a one-click pinyin slug suggestion. `MarkdownEditor` uses CodeMirror Markdown mode, keeps an editor-view ref, and invokes pure selection commands. Image insertion uses the current selection and never a second hidden textarea.

- [ ] **Step 5: Implement media and crop UI**

`MediaPanel` handles file input, drag/drop, and paste; it rejects unsupported MIME and files over 25 MiB before state changes. Body images receive safe unique names. Cover selection opens `CoverCropDialog` at fixed 16:9, converts with `renderCover()`, and replaces the old cover only after success.

- [ ] **Step 6: Implement dashboard and bundle actions**

`DraftDashboard` loads newest-first and exposes open, duplicate, rename, delete confirmation, and draft export. `BundleActions` imports transactionally, asks replace-or-new after validation, displays warnings before production export, and downloads through a temporary object URL that is revoked afterward. When autosave fails, the persistent alert includes an Emergency Draft Export button. After seven days without a portable export, the dashboard shows a non-blocking backup reminder.

- [ ] **Step 7: Assemble responsive layouts and notifications**

`App` switches between dashboard and workspace. Desktop uses inspector/editor/preview columns. Below 1024 px it uses Settings, Write, and Preview tabs while keeping state mounted. Add `role="status"` for save success and `role="alert"` for blocking errors. Restore focus when dialogs close and respect reduced motion.

- [ ] **Step 8: Verify and commit**

```bash
npm test -- tests/unit/markdown-commands.test.ts tests/components/MetadataPanel.test.tsx tests/components/Workspace.test.tsx
npm run lint
npm run typecheck
npm run build
git add src/app src/metadata/MetadataPanel.tsx src/editor src/media/*.tsx src/drafts/DraftDashboard.tsx src/bundles/BundleActions.tsx tests/unit/markdown-commands.test.ts tests/components
git commit -m "feat: integrate IMX article workspace"
```

---

### Task 8: Verify Browser Workflows, Accessibility, and IMX Visual Fidelity

**Files:**
- Create: `playwright.config.ts`, `tests/helpers/test-images.ts`
- Create: `tests/e2e/editor.spec.ts`, `tests/e2e/security.spec.ts`, `tests/e2e/visual.spec.ts`
- Create: `tests/e2e/visual.spec.ts-snapshots/*`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete SPA from Task 7.
- Produces: browser proof of authoring, recovery, round-trip, security, responsiveness, accessibility, and appearance.

- [ ] **Step 1: Configure deterministic Playwright**

Configure Chromium, Firefox, and WebKit with `zh-CN`, `Asia/Shanghai`, reduced motion, and `baseURL: http://127.0.0.1:4173`. Use `npm run build && npm run preview -- --host 127.0.0.1` as reusable web server. Restrict screenshot baselines to Chromium with 1440 by 900 default viewport.

- [ ] **Step 2: Write the failing complete round-trip test**

The test performs:

```text
new article
→ metadata and manual slug
→ deterministic cover/body uploads
→ real Chromium cover conversion to WebP at 16:9 and at most 1600 by 900
→ cursor image insertion
→ IMX title, TOC, table, quote and code assertions
→ Saved status
→ reload recovery
→ production ZIP with draft false
→ new draft
→ ZIP import
→ matching metadata, Markdown, media names and byte hashes
```

`tests/helpers/test-images.ts` generates deterministic PNG buffers rather than checking binary fixtures into source control.

- [ ] **Step 3: Write failing security and recovery tests**

Cover script tags, `onclick`, `javascript:` links, SVG, oversized source, malicious ZIP path, corrupt TOML, missing image, simulated IndexedDB failure, and current-draft preservation after failed import.

- [ ] **Step 4: Write failing accessibility, responsive, and visual tests**

Use `@axe-core/playwright` to require zero serious/critical violations on dashboard and workspace. At 390 by 844, require all three mobile tabs and no page-level horizontal overflow. Capture approved light/dark desktop/mobile IMX previews containing heading hierarchy, table, quote, code, list, and image.

- [ ] **Step 5: Establish baselines, fix product defects, and rerun**

```bash
npx playwright install chromium firefox webkit
npm run test:e2e -- --update-snapshots
npm run test:e2e
```

Expected: the baseline run is intentional and the second run passes without updates. Fix product code for behavior contradicting the design.

- [ ] **Step 6: Run the full local gate**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:theme
npm run test:e2e
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts package.json package-lock.json tests src
git commit -m "test: verify complete article authoring flow"
```

### Task 9: Add Security Headers, CI, Maintenance Automation, and Documentation

**Files:**
- Create: `vercel.json`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Modify: `.gitignore`
- Create: `README.md`, `LICENSE`
- Test: `tests/unit/vercel-config.test.ts`

**Interfaces:**
- Consumes: verified npm scripts and static `dist` output.
- Produces: secure static hosting, reproducible checks, and operator documentation.

- [ ] **Step 1: Write the failing Vercel configuration test**

Parse `vercel.json`; assert Vite framework, `dist` output, SPA rewrite to `/index.html`, and global CSP, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`. Assert CSP permits self-hosted resources and `blob:`/`data:` images but blocks external framing and object embedding.

- [ ] **Step 2: Verify failure**

Run `npm test -- tests/unit/vercel-config.test.ts`.

Expected: FAIL because `vercel.json` does not exist.

- [ ] **Step 3: Create static deployment and headers**

Create `vercel.json` with Vite build, `dist`, SPA rewrite, and:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

The inline-style allowance supports the script-free iframe preview only; do not allow inline scripts.

- [ ] **Step 4: Create CI and dependency maintenance**

CI triggers on `main` pushes and pull requests, uses Node 22 with npm cache, runs `npm ci`, installs Chromium/Firefox/WebKit with system dependencies, then lint, typecheck, unit tests, build, theme manifest, and browser tests. Upload `playwright-report` only on failure for 7 days.

Dependabot uses npm at repository root monthly and groups non-major development-dependency updates.

- [ ] **Step 5: Write README, licenses, and ignore rules**

README includes purpose, privacy model, browser support, development, writing flow, recovery, `content/posts/` upload, image formats, preview limits, theme synchronization, tests, Vercel deployment, and license attribution. `.gitignore` excludes `node_modules`, `dist`, `.vercel`, Playwright reports, test results, local env files, macOS metadata, and editor caches. The project `LICENSE` is MIT; keep IMX license separate.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- tests/unit/vercel-config.test.ts
npm run lint
npm run typecheck
npm test
npm run build
npm run check:theme
git diff --check
git add vercel.json .github .gitignore README.md LICENSE tests/unit/vercel-config.test.ts
git commit -m "ci: add secure delivery pipeline"
```

Expected: all checks pass and no environment file, token, `.vercel`, ZIP, or report is staged.

---

### Task 10: Prove Hugo Compatibility, Publish GitHub, and Deploy Vercel

**Files:**
- Create: `scripts/export-verification-bundle.ts`
- Create: `docs/release-verification.md`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: tested SPA, authenticated `gh`, Vercel plugin/CLI, read-only blog source, and bundle exporter.
- Produces: Hugo build proof, public GitHub repository, Git-integrated Vercel project, verified Production URL, and release record.

- [ ] **Step 1: Add a deterministic release bundle generator**

Create `scripts/export-verification-bundle.ts` and execute it with the pinned `tsx` dependency installed in Task 1. It imports the production exporter directly and writes `/tmp/imx-post-studio-verification.zip` with slug `imx-post-studio-verification`, `draft = false`, a known-valid embedded WebP cover byte array, a known-valid embedded PNG body byte array, headings, table, quote, list, and JavaScript fence.

```bash
npm pkg set scripts.verify:bundle="tsx scripts/export-verification-bundle.ts"
```

- [ ] **Step 2: Build the exported article with the real site in `/tmp`**

```bash
npm run verify:bundle
test_root=$(mktemp -d /tmp/imx-post-studio-hugo.XXXXXX)
cp -R /Users/cb/Documents/Codex/test0/c-x-x.github.io "$test_root/site"
unzip -q /tmp/imx-post-studio-verification.zip -d "$test_root/site/content/posts"
hugo --source "$test_root/site" --destination "$test_root/public" --cacheDir "$test_root/hugo-cache" --gc --minify
test -f "$test_root/public/posts/imx-post-studio-verification/index.html"
```

Expected: Hugo exits 0, article HTML exists, and original repositories remain clean.

- [ ] **Step 3: Run the final local release gate**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:theme
npm run test:e2e
git diff --check
git status --short
git -C /Users/cb/Documents/Codex/test0/hugo-theme-imx status --short
git -C /Users/cb/Documents/Codex/test0/c-x-x.github.io status --short
```

Expected: tests pass; all repositories are clean; the new repository contains no secret or generated release artifact.

- [ ] **Step 4: Commit the release verifier**

```bash
git add scripts/export-verification-bundle.ts docs/release-verification.md package.json package-lock.json
git commit -m "test: verify exported bundles with Hugo"
```

- [ ] **Step 5: Create and push the public GitHub repository**

```bash
gh auth status
gh repo create c-x-x/imx-post-studio --public --source=. --remote=origin --push --description "Browser-only editor and IMX preview for Hugo article bundles"
git remote -v
gh repo view c-x-x/imx-post-studio --json nameWithOwner,visibility,url,defaultBranchRef
```

Expected: repository is PUBLIC, default branch is `main`, and `origin` is `https://github.com/c-x-x/imx-post-studio.git`.

- [ ] **Step 6: Require successful GitHub Actions**

```bash
run_id=$(gh run list --repo c-x-x/imx-post-studio --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --repo c-x-x/imx-post-studio --exit-status
```

Expected: `main` CI succeeds. On failure, use the GitHub CI debugging workflow and do not bypass checks.

- [ ] **Step 7: Link and deploy Vercel Production**

Use team `team_1QOyNpqBUjFvkyq0dYxTAJFS` (`cxxs-projects`) and project `imx-post-studio`. Prefer the Vercel plugin for project/deployment state and CLI for linking gaps:

```bash
npx vercel@56.2.0 whoami
npx vercel@56.2.0 link --yes --scope cxxs-projects --project imx-post-studio
npx vercel@56.2.0 git connect https://github.com/c-x-x/imx-post-studio
npx vercel@56.2.0 deploy --prod --yes
```

Expected: `.vercel/project.json` is ignored, Production becomes READY, and later `main` pushes deploy automatically.

- [ ] **Step 8: Verify Production end to end**

Use Vercel deployment inspection and browser verification to confirm 200 response, Vite build, security headers, no console/static errors, desktop/mobile layouts, no POST/PUT/PATCH article requests, reload autosave, light/dark IMX preview, and production ZIP re-import with matching content and image hashes.

Record Production URL, deployment ID, commit SHA, READY status, duration, headers, browser results, and remaining preview-fidelity boundary in `docs/release-verification.md`.

- [ ] **Step 9: Publish the release record**

```bash
git add docs/release-verification.md
git commit -m "docs: record production verification"
git push origin main
run_id=$(gh run list --repo c-x-x/imx-post-studio --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --repo c-x-x/imx-post-studio --exit-status
```

Expected: release record is public, CI passes again, and Vercel deploys that commit.

---

## Final Verification Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] `npm run check:theme` passes.
- [ ] `npm run test:e2e` passes in Chromium, Firefox, and WebKit.
- [ ] Visual snapshots pass at 1440 by 900 and 390 by 844 in light and dark modes.
- [ ] Exported verification bundle builds with the real blog under `/tmp`.
- [ ] `hugo-theme-imx` and `c-x-x.github.io` remain clean.
- [ ] GitHub repository is public and Actions is green.
- [ ] Vercel Production is READY and Git Integration redeploys `main`.
- [ ] Production verification proves article and image data are not uploaded.
- [ ] Final handoff includes local path, GitHub URL, Vercel URL, commit, tests, and preview limitations.
