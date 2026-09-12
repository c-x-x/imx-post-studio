# IMX Post Studio release verification

This record separates reproducible local proof from the external publication
and deployment evidence that must be captured after a reviewed release.

## Local Hugo compatibility proof

The local verifier writes `/tmp/imx-post-studio-verification.zip` with the
production exporter. It uses the fixed slug `imx-post-studio-verification`,
`draft = false`, embedded valid WebP/PNG media, and Markdown heading, table,
quote, list, JavaScript fence, and local image coverage.

Run:

```bash
npm run verify:bundle
```

For each release candidate, record the ZIP SHA-256, archive entry hashes,
temporary Hugo root, Hugo version, generated article path, and the marker and
asset checks from the local verification command. These are filled by the
local release-verifier phase before external publication.

### Recorded local verifier run

- ZIP SHA-256: `4e44053e4bc975464f016190221f5cdbb4a51073162cde86b417c49157051e47`
  (1,431 bytes under `TZ=UTC`, `TZ=Asia/Shanghai`, and
  `TZ=America/New_York`). The verifier fixes the exporter call's clock and
  calendar to UTC, then restores the caller's `Date` constructor and `TZ`.
- Archive media SHA-256: `cover.webp` is
  `9dc666c290fd2d2564398214a85fb0516792e6dfd951bea9e2be08b247c280ca`;
  `verification.png` is
  `5dcaa2a2a26e63ec6622ba70792e458887fa2acd7f7c894fc425e340c9ba3f34`.
- Hugo `v0.164.0+extended+withdeploy` built the copied real site at
  `/tmp/imx-post-studio-hugo-tz-final.iU3ksG`. It produced
  `/tmp/imx-post-studio-hugo-tz-final.iU3ksG/public/posts/imx-post-studio-verification/index.html`
  plus both article media files. The resulting HTML contains the title,
  heading, table, quote, list, JavaScript fence, cover reference, and body
  image reference.
- The source bundle was inspected at
  `/tmp/imx-post-studio-task10-tz-final.gcOpMb`; the copied-site build did not
  mutate the Studio source checkout.

## Studio Dock and immersive-sidebar proof (2026-08-05)

- The Studio owns its Dock structure, liquid-glass styling, responsive
  treatment, attraction/merge behavior, and article preview styles.
- `npm test`: 31 files and 195 tests passed.
- `npm run lint`, `npm run typecheck`, and `npm run check:standalone`: passed.
- `npm run build`: passed. Vite still reports the existing non-blocking warning
  that the main JavaScript chunk is larger than 500 kB after minification.
- `npm run test:e2e`: 45 tests passed across Chromium, Firefox, and WebKit;
  12 browser-inapplicable screenshot/CSP cases were skipped by their existing
  project rules.
- Browser proof covers desktop Dock attraction and merge, persisted sidebar
  collapse with a hidden scrollbar and expanded editor, mobile navigation and
  preview without horizontal overflow, modal stacking, focus preservation,
  the full author/export/re-import flow, security checks, and approved preview
  screenshots.

## External publication and deployment evidence

These values were recorded from the authorized GitHub publication and Vercel
production deployment. Browser-level production interaction remains explicitly
marked below because the local browser policy service was unavailable during
that portion of the release check.

| Field | Value |
| --- | --- |
| Public GitHub repository URL | `https://github.com/c-x-x/imx-post-studio` (public) |
| GitHub default branch and CI run URL/status | Default branch: `main`. The application commit `e47cfbdc9f6a7eaaa8d79ffddcfee608dbe0adee` passed [run 30931426055](https://github.com/c-x-x/imx-post-studio/actions/runs/30931426055). The first Git-triggered production deployment commit `a72488792961ca39c34e63dd20ce2ef020905bcf` passed [run 30969483926](https://github.com/c-x-x/imx-post-studio/actions/runs/30969483926): lint, typecheck, unit tests, build, standalone verification, and the complete Playwright E2E suite. |
| Production Vercel URL | `https://imx-post-studio.vercel.app` |
| Vercel project/deployment ID, commit, READY status, duration | Project `prj_dp5tWkWeYlG6XZroxi4Ax5aPsoCD`; bootstrap deployment `dpl_AeVoWbPszR8rBT4hi1CkG1LfVHV1` built the fixed public GitHub commit `e47cfbd…` and reached `READY` in about 17 seconds. The project is subsequently connected to the GitHub repository for normal Git-triggered deployments. |
| Production HTTP security headers | `200` for `/`; CSP restricts every source to the static app contract (`connect-src 'self'`, `frame-ancestors 'none'`, no object sources); `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and the camera/microphone/geolocation/payment/USB Permissions Policy are present. |
| Production browser, autosave, preview, ZIP re-import, and network evidence | The complete equivalent workflow passed locally and in GitHub CI. Production HTTP verification confirms the SPA, CSS, WebP WebAssembly modules, and all seven self-hosted IMX font assets return `200` with correct MIME types. Interactive browser verification could not be completed in this run because the local browser policy service refused all Vercel URLs; do not treat it as passed until rerun from a healthy browser session. |
| Remaining production preview-fidelity boundary | The Studio-owned preview has approved desktop/mobile and light/dark visual baselines. It is intentionally not a per-keystroke Hugo build: Hugo shortcodes, site-specific syntax-highlighting details, and generated responsive image variants remain authoritative only after the exported bundle is built by Hugo. |

## Publication checklist

- Re-run the local release gate and retain its exact output in the task report.
- Confirm GitHub Actions succeeds on the published commit before deploying.
- Verify the Production response and configured headers.
- Re-run the production browser path from a healthy browser session: create a
  draft, reload to confirm autosave, check both preview modes and viewports,
  export/re-import a bundle, and confirm no article-data network upload occurs.
