# CI Efficiency Design

## Goal

Reduce redundant GitHub Actions work without reducing validation coverage on pull requests or `main`.

## Design

The existing single Ubuntu job remains the source of truth and continues to run linting, TypeScript checks, unit/component tests, a production build, the standalone-project check, and the complete Chromium, Firefox, and WebKit Playwright suite for both pull requests and pushes to `main`.

The production build runs exactly once in CI. The workflow keeps its explicit `npm run build` step so build failures remain clearly identified. In CI, Playwright starts `vite preview` from that existing `dist` directory; outside CI, Playwright continues to build before preview so local `npm run test:e2e` remains self-contained.

`actions/setup-node` continues to own npm download caching and explicitly keys it from `package-lock.json`. Dependency installation uses the cache preferentially and skips the unrelated audit and funding network work. Playwright browser binaries are not cached because Playwright documents that restoring that cache usually costs about as much time as downloading it and Linux system dependencies cannot be cached.

Workflow-level concurrency groups runs by workflow and PR number or Git ref. A newer commit cancels an obsolete in-progress run for the same PR or branch, while unrelated PRs and branches remain independent.

## Files

- `.github/workflows/ci.yml`: npm cache detail, lean install flags, and stale-run cancellation.
- `playwright.config.ts`: environment-aware preview command that prevents the second CI build.

## Verification

- Parse the workflow as YAML and inspect the resulting keys.
- Load `playwright.config.ts` with and without `CI` and assert the two expected server commands.
- Run lint, typecheck, unit/component tests, production build, standalone verification, and the full three-browser E2E suite.

## Non-goals

- Do not reduce browser coverage.
- Do not split the suite into multiple billed jobs or enable additional workers.
- Do not cache Playwright browser binaries.
- Do not change test behavior, retries, artifacts, or deployment.
