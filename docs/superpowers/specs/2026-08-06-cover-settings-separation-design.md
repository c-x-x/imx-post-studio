# Cover Settings Separation Design

## Goal

Separate article-cover management from body-image management so each workspace rail has one clear responsibility.

## Layout and Responsibilities

- The left `#panel-settings` rail contains article metadata followed by an “文章封面” section.
- The cover section owns cover selection, validation, cropping, current-cover display, replacement, and removal.
- The right `#panel-actions` rail keeps article actions, body-image intake/list management, and bundle import/export operations.
- The right media section accepts and displays body images only; it never renders cover controls or cover assets.
- On mobile, the existing “设置” tab keeps both rails in their current responsive flow, with the same responsibility split.

## Component Boundary

- Extract a dedicated `CoverPanel` from the existing cover-specific behavior in `MediaPanel`.
- `CoverPanel` receives the current cover, draft identity, disabled state, replacement/removal callbacks, and the shared intake-busy callback.
- `MediaPanel` retains body-image batching, drag/drop, paste, insertion, reference-aware removal, and body-media errors.
- Existing validation, crop conversion, asset shape, exported filename, and draft-transition guards remain unchanged.

## Behavior and Error Handling

- Cover files remain limited to JPEG, PNG, and WebP and 25 MiB.
- Invalid covers report errors in the left cover section.
- Body-image errors remain in the right media section.
- Switching drafts or entering a locked transition invalidates pending cover work exactly as before.
- Removing the cover does not invoke body-reference checks; referenced body-image deletion behavior is unchanged.

## Verification

- Component tests verify the cover control and cover asset are inside `#panel-settings` and absent from `#panel-actions`.
- Existing cover validation, crop, stale-draft, and busy-state tests are retained or moved to `CoverPanel` coverage.
- Browser tests verify desktop placement and mobile visibility without overflow.
- Full unit, lint, type, build, theme-manifest, and Playwright suites must pass before merge and push.

## Non-goals

- No changes to article data, front matter, ZIP formats, image conversion, preview rendering, or vendored IMX theme files.
- No new cover metadata or visual redesign beyond placing the existing workflow in its correct rail.
