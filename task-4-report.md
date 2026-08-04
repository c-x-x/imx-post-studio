# Task 4 Report: Transactional Hugo ZIP Bundles

## TDD evidence

1. Added `archive-path`, round-trip, and bundle-security tests before creating
   any `src/bundles/*` module.
2. Recorded the required RED run:

   ```text
   npm test -- tests/unit/archive-path.test.ts tests/unit/bundle-roundtrip.test.ts tests/unit/bundle-security.test.ts
   Failed to resolve ../../src/bundles/archive-path
   Failed to resolve ../../src/bundles/export-bundle
   Failed to resolve ../../src/bundles/import-bundle
   ```

3. Implemented the minimal browser-only Zip.js archive service, then observed
   the focused suite pass: 3 files, 20 tests.

## Delivered behavior

- Export validates title, slug, front matter, image names and limits, duplicate
  names, cover contract, and missing Markdown image references before creating
  a `ZipWriter`.
- Export emits `<slug>/index.md` first, then lexically sorted
  `<slug>/images/*`, closes the writer on both success and failure, and uses a
  front-matter draft override without mutating the source draft.
- ZIP import inspects all central-directory metadata before any body is read:
  500 entries maximum, 25 MiB per file, and 250 MiB total. It rejects unsafe,
  ambiguous, duplicate, directory, symlink, unexpected, and nested entries.
- Import requires one root and exactly one root `index.md`; it derives the slug
  from the root when there is no cover, checks cover/root consistency, detects
  JPEG/PNG/WebP/GIF signatures from bytes, validates Markdown references, and
  returns a draft only after every check succeeds.
- Loose import enforces the same file-count, size, name, byte-signature,
  duplicate-name, cover, and reference checks without mutating editor state.

## Verification

All commands completed with exit code 0:

```text
npm test -- tests/unit/archive-path.test.ts tests/unit/bundle-roundtrip.test.ts tests/unit/bundle-security.test.ts
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

The full suite result was 9 files and 94 tests passing.

## Self-review and remaining concerns

- The implementation uses Zip.js only; it has no backend, credentials, CDN,
  filesystem extraction, or network access.
- Image validation intentionally uses magic-byte signatures rather than a full
  image decoder. This prevents extension/MIME spoofing and rejects unsupported
  formats, while detailed image decode validity remains the responsibility of
  the normal browser image/cover pipeline.
