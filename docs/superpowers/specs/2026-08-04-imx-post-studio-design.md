# IMX Post Studio Design

**Date:** 2026-08-04

**Status:** Approved

**Target repository:** `c-x-x/imx-post-studio` (Public)

**Target deployment:** Vercel team `cxx's projects`

**IMX preview baseline:** `hugo-theme-imx` v1.4.9, commit `6f08e8e`

## 1. Purpose

IMX Post Studio is a static, browser-only writing application for preparing article bundles compatible with the IMX Hugo theme. The author writes Markdown, supplies metadata and images, sees a high-fidelity IMX article preview, and downloads a ZIP containing a ready-to-upload Hugo leaf bundle.

The application never writes to the blog repository. The author remains the final publication gate by manually uploading the exported folder to `content/posts/` in `c-x-x.github.io`.

## 2. Goals

- Focus the writing interface on article content, metadata, and images.
- Generate the exact directory and path conventions used by the current blog.
- Provide a high-fidelity, responsive IMX article preview in light and dark modes.
- Autosave multiple local drafts, including image blobs.
- Import and export portable draft bundles without a server.
- Export a production article bundle that can be copied directly into `content/posts/`.
- Keep GitHub credentials, Vercel credentials, and article data out of the runtime application.
- Deploy automatically from a public GitHub repository to Vercel.

## 3. Non-goals for Version 1

- No GitHub login, repository write access, commits, or pull requests from the browser.
- No user accounts, database, cloud image storage, or automatic cross-device draft sync.
- No server-side Hugo build for each preview update.
- No Giscus comment preview.
- No guarantee that Hugo shortcodes or every Hugo-specific Goldmark extension render identically in the browser.
- No SVG upload support.

## 4. Architecture

The application is a React, TypeScript, and Vite single-page application. All editing, image processing, preview rendering, draft storage, validation, import, and export happen locally in the browser.

The major modules are:

- **App shell:** coordinates navigation, layout, notifications, and draft lifecycle.
- **Metadata editor:** owns typed Front Matter fields and validation.
- **Markdown editor:** owns raw Markdown editing, toolbar actions, and cursor-aware image insertion.
- **Media manager:** owns uploaded files, cover processing, safe names, object URLs, and reference checks.
- **Preview renderer:** converts Markdown to sanitized HTML and renders it in an isolated IMX page shell.
- **Draft repository:** persists structured drafts and blobs in IndexedDB.
- **Bundle service:** imports and exports Hugo-compatible ZIP archives.
- **Theme snapshot:** contains the pinned IMX preview CSS, fonts, DOM contract, license, and manifest.

No runtime API routes or Vercel Functions are used.

## 5. Canonical Article Model

The editor maintains one canonical structured article model rather than treating generated Front Matter text as application state.

Required or supported fields:

- `title`: required string.
- `slug`: required lowercase ASCII slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- `date`: RFC 3339 date-time using `+08:00` by default.
- `draft`: boolean, default `true` for new articles.
- `categories`: string array.
- `tags`: string array.
- `image`: optional generated cover path.
- `description`: string; strongly recommended but not a hard export requirement.
- `toc`: boolean, default `true`.
- `body`: raw Markdown string.
- `media`: ordered collection of local image records and blobs.

When a title contains Chinese characters, the editor automatically proposes an editable pinyin-based slug. A user-edited slug is never silently replaced.

The importer accepts both date-only TOML values and RFC 3339 date-times used by existing articles. The canonical editor state normalizes them to a `+08:00` RFC 3339 date-time without changing the intended calendar date.

Generated TOML uses deterministic key order and valid escaped basic strings:

```toml
+++
title = "文章标题"
date = "2026-08-04T16:00:00+08:00"
draft = true
categories = ["技术", "教程"]
tags = ["Hugo", "IMX"]
image = "/posts/my-article/images/cover.webp"
description = "文章描述"
toc = true
+++
```

## 6. User Interface

### Desktop

The primary workspace uses three regions:

1. A collapsible metadata and media inspector.
2. A Markdown editor with a compact formatting toolbar.
3. A live IMX article preview.

The top bar contains New, Import, draft save state, Export Draft, Export Article, theme mode, viewport mode, and application help.

### Tablet and mobile

Smaller screens use three tabs: Settings, Write, and Preview. Draft and export actions remain reachable from a compact top bar or action menu. Switching tabs must not lose focus state, unsaved text, or selected media.

### Accessibility

- All controls have visible labels or accessible names.
- Keyboard navigation covers editor actions, fields, media selection, and dialogs.
- Focus returns to the initiating control when a dialog closes.
- Validation is announced and associated with its field.
- Color is not the only way to communicate status.
- Reduced-motion preferences are respected.

## 7. IMX Preview

The preview reproduces the current IMX article DOM and uses a pinned snapshot of the theme's relevant CSS and fonts. It includes:

- Article title, publication date, categories, tags, approximate word count, and approximate reading time.
- IMX article typography, spacing, links, lists, blockquotes, tables, code blocks, and images.
- Generated heading IDs and a table of contents when `toc` is enabled and headings exist.
- Desktop and mobile responsive layouts.
- Light and dark theme modes.

Preview HTML is rendered inside a sandboxed iframe. Imported Markdown HTML is sanitized before insertion. The preview must not execute scripts from article content.

The preview is high fidelity, not a server-side Hugo build. The UI displays the pinned IMX version and a concise note that final Hugo output remains authoritative for shortcodes, syntax-highlighting details, and generated responsive image files.

Local images use object URLs in preview. Markdown references such as `images/example.png` resolve to the corresponding in-memory blob without changing exported Markdown.

## 8. Image Handling

### Cover image

- Accept JPEG, PNG, or WebP.
- Present a 16:9 crop preview.
- Produce WebP at quality 82 with maximum dimensions of 1600 by 900.
- Do not upscale an image smaller than the target dimensions.
- Export it as `images/cover.webp`.
- Generate the Front Matter value `/posts/<slug>/images/cover.webp`.

### Body images

- Accept JPEG, PNG, WebP, and GIF through file selection, drag-and-drop, or clipboard paste.
- Keep JPEG and PNG in their source formats so the IMX Hugo render hook can generate responsive WebP variants during the final site build.
- Keep WebP and GIF in their source formats.
- Reject SVG in version 1.
- Normalize names to safe lowercase file names, preserve a meaningful extension, and resolve collisions with numeric suffixes.
- Insert Markdown at the current cursor position using `![alt](images/<filename>)`.

Deleting an image that is still referenced requires confirmation. Missing referenced images block final export. Unused images produce a warning but do not block export.

## 9. Draft Persistence

IndexedDB stores multiple structured drafts and image blobs. Autosave runs 800 milliseconds after the last state change and exposes three states: Saving, Saved, and Failed. A failed save must remain visible until recovery or a later successful save.

The draft list displays title, slug, last modified time, and cover thumbnail. It supports open, duplicate, rename, delete with confirmation, and export.

Browser storage is not treated as the only backup. The interface periodically recommends exporting a draft package and always exposes an emergency draft export when storage fails.

## 10. Import and Export

### Bundle structure

Both draft and production exports use a standard Hugo leaf bundle:

```text
my-article/
├── index.md
└── images/
    ├── cover.webp
    └── example.png
```

Draft export produces `<slug>-draft.zip` with `draft = true`. Production export produces `<slug>.zip`; before download, the user chooses whether to retain `draft = true` or set it to `false`.

### Import behavior

The core cross-browser import path is a ZIP containing one article directory, `index.md`, and optional `images/`. A secondary import form accepts one `index.md` followed by a separate multi-file selection for its images. Browsers that expose directory selection may additionally offer folder import as a progressive enhancement, but ZIP import remains authoritative.

Import is transactional:

1. Inspect archive paths and uncompressed sizes.
2. Locate and parse one `index.md`.
3. Parse TOML Front Matter and Markdown.
4. Load supported images.
5. Resolve cover and body references.
6. Validate the complete draft.
7. Ask whether to replace the current draft or create a separate draft.

Any failure before the final step leaves the current editor state unchanged.

### Export validation

Final export blocks on invalid slug, missing title, invalid Front Matter, missing local images, duplicate archive paths, or failed cover conversion. It warns on an empty description, unused images, external images, or `draft = true`.

Output is UTF-8 with LF line endings and deterministic ordering to make re-import and testing reliable.

## 11. Security and Privacy

- The runtime application has no backend and sends no article or image data to Vercel.
- It does not request GitHub or Vercel credentials.
- It includes no analytics or behavioral telemetry.
- Preview markup is sanitized and isolated in a sandboxed iframe.
- SVG is rejected in version 1.
- ZIP entry paths are normalized and path traversal is rejected.
- A single uploaded source file is limited to 25 MiB. ZIP import is limited to 500 entries, 25 MiB per uncompressed file, and 250 MiB total uncompressed size. Limits are checked before loading entries into editor state.
- Imported data is never committed to IndexedDB until parsing and validation succeed.
- Object URLs are revoked when no longer needed.
- Vercel response headers include a restrictive Content Security Policy, `X-Content-Type-Options: nosniff`, a restrictive Referrer Policy, a restrictive Permissions Policy, and anti-framing protection.
- Dependencies and generated assets are pinned by the lockfile and reviewed by automated dependency updates.

## 12. Error Handling

Errors use actionable Chinese messages and preserve user work wherever possible.

- Autosave failure: retain the in-memory draft and offer emergency ZIP export.
- Corrupt or unsupported archive: report the failing path or field and do not replace current content.
- Storage quota exceeded: identify large drafts and allow export before deletion.
- Image conversion failure: preserve the original upload in memory and request another file or retry.
- Missing image reference: list every missing path and offer reference removal or replacement.
- Unsupported Front Matter: show the parsed location and retain the source for manual recovery.
- Build or deployment failure: retain the last successful Vercel production deployment.

## 13. Theme Snapshot and Maintenance

The repository vendors only the IMX files needed for article preview and includes the IMX MIT license and source attribution.

`theme-manifest.json` records:

- IMX tag and commit.
- Source repository URL.
- Copied file allowlist.
- SHA-256 hash for each copied file.
- Sync timestamp.

`npm run sync:imx -- <theme-path>` reads a local theme checkout without modifying it, copies the allowlisted files into the new repository, regenerates the manifest, and runs preview tests. Theme updates are explicit commits; they never follow `master` automatically.

CI verifies that vendored files match their manifest hashes. Visual baselines must be reviewed when a theme sync changes appearance.

## 14. Project Layout

```text
imx-post-studio/
├── src/
│   ├── app/
│   ├── editor/
│   ├── metadata/
│   ├── media/
│   ├── preview/
│   ├── drafts/
│   ├── bundles/
│   └── theme/imx/
├── scripts/
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── visual/
├── docs/superpowers/specs/
├── .github/workflows/ci.yml
├── vercel.json
├── package.json
└── package-lock.json
```

## 15. Testing Strategy

### Unit and integration tests

- Slug generation, manual override, and validation.
- TOML generation and round-trip parsing, including quotes and Chinese content.
- Image-name normalization and collision handling.
- Cover crop, resize, and WebP output.
- Markdown image-reference extraction and missing/unused media detection.
- ZIP path traversal, archive bounds, and corrupt archive handling.
- Bundle export followed by import with equivalent article data and image bytes.
- IndexedDB create, update, list, delete, quota failure, and schema migration behavior.
- Markdown sanitization against script, event-handler, and unsafe-URL payloads.

### Browser tests

The primary end-to-end scenario is:

```text
Create article
→ enter metadata
→ upload cover and body image
→ insert image into Markdown
→ inspect IMX preview and TOC
→ confirm autosave
→ reload and recover
→ export bundle
→ clear the editor
→ import the bundle
→ verify equivalent content and media
```

Playwright CI runs the primary workflow in Chromium, Firefox, and WebKit. Responsive checks cover a 1440 by 900 desktop viewport and a 390 by 844 mobile viewport.

### Visual regression

Pinned screenshots cover light and dark modes, desktop and mobile, long-form typography, headings and TOC, code blocks, tables, blockquotes, lists, and images. A theme snapshot update requires intentional baseline review.

## 16. Continuous Integration and Deployment

The public GitHub repository is `c-x-x/imx-post-studio` with default branch `main` and MIT license.

GitHub Actions runs on pushes and pull requests:

```text
npm ci
→ lint
→ typecheck
→ unit/integration tests
→ production build
→ Playwright tests
→ theme manifest verification
```

Dependabot checks npm dependencies monthly and groups non-breaking development dependency updates. Dependency updates must pass the same CI checks before merge.

Vercel Git Integration owns deployment:

- `main` deploys to Production.
- Other branches and pull requests receive Preview deployments.
- Build command is `npm run build`.
- Output directory is `dist`.
- No runtime environment variables or deployment tokens are required in the repository.

Production verification checks the page response, security headers, console errors, mobile layout, local autosave, IMX preview, bundle export, and bundle re-import. Because the site is static, runtime error logging is expected to be empty.

## 17. Acceptance Criteria

The project is complete only when:

1. A user can create, edit, duplicate, delete, autosave, export, and re-import drafts.
2. Cover and body images follow the current IMX/Hugo path contract.
3. A generated production ZIP can be placed under `content/posts/` and built successfully by a temporary copy of the real `c-x-x.github.io` Hugo site. The source checkout remains untouched; generated article files, Hugo output, module cache, and resource cache are placed under `/tmp` for this verification.
4. The high-fidelity preview matches the pinned IMX article layout across desktop/mobile and light/dark modes within approved visual baselines.
5. Imported hostile HTML, SVG, and archive paths cannot execute script or escape the expected bundle.
6. Refresh recovery and ZIP round-trip tests preserve content and image bytes.
7. All local and GitHub CI checks pass.
8. The public GitHub repository exists and Vercel Production is live and verified.
9. `hugo-theme-imx` and `c-x-x.github.io` remain unmodified throughout development, except for read-only build verification using temporary output locations.

## 18. Confirmed Decisions

- Use a public repository.
- Use a static browser-only application.
- Use high-fidelity browser rendering rather than running Hugo per keystroke.
- Keep publication manual through an exported Hugo article bundle.
- Keep drafts local with portable ZIP backup.
- Pin and explicitly sync the IMX preview version.
- Preserve the existing theme and blog repositories as read-only inputs.
