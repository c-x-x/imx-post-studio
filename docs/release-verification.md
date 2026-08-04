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
  `/tmp/imx-post-studio-task10-tz-final.gcOpMb`.
  The original `hugo-theme-imx` and `c-x-x.github.io` worktrees were clean
  before and after the copied-site build.

## External publication and deployment evidence

The following values intentionally remain placeholders until the controller
has completed the separately authorized GitHub and Vercel steps. Do not infer
or fabricate them from a local build.

| Field | Value |
| --- | --- |
| Public GitHub repository URL | Pending external publication |
| GitHub default branch and CI run URL/status | Pending external publication |
| Production Vercel URL | Pending external deployment |
| Vercel project/deployment ID, commit, READY status, duration | Pending external deployment |
| Production HTTP security headers | Pending external deployment verification |
| Production browser, autosave, preview, ZIP re-import, and network evidence | Pending external deployment verification |
| Remaining production preview-fidelity boundary | Pending external deployment verification |

## Publication checklist

- Re-run the local release gate and retain its exact output in the task report.
- Confirm GitHub Actions succeeds on the published commit before deploying.
- Verify the Production response, configured headers, browser behavior, and
  absence of article-data upload requests before replacing the placeholders.
