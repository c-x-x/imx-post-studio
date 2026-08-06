# IMX Theme Parity Design

## Goal

Make every Studio surface visually and responsively consistent with the current `hugo-theme-imx` source, except that the Studio Dock and its comment-button capability remain interactive Studio features.

## Source of Truth

- Theme tokens, typography, cards, controls, article reading rhythm, and responsive breakpoints come from `hugo-theme-imx/assets/css/`.
- Studio keeps its existing local font assets and the Dock’s shared merge implementation; no theme source file is changed.
- Existing editing, autosave, import/export, media, crop, preview sandbox, draft, modal, and comment-button behavior remains unchanged.

## Visual Scope

- Home, draft library, workspace rails, editor, media/cover tools, dialogs, notifications, empty states, and preview shell use the same theme visual language rather than Studio-specific approximations.
- Light and dark mode use the exact theme token relationships and contrast levels.
- Typography follows IMX sans for interface text and IMX serif for editorial headings, with matching size hierarchy, spacing, borders, radii, shadows, and glass treatment.
- Mobile uses the theme’s responsive spacing, stacked-card geometry, control heights, and reading width; Dock behavior remains the established compact Studio interaction.

## Implementation Boundary

- Add a Studio-local theme-parity layer derived from the theme CSS; do not import Hugo template markup or modify the vendored theme snapshot.
- Replace duplicate Studio visual token values with mapped theme tokens where they represent the same semantic meaning.
- Keep only layout rules required by Studio’s editor rails, tabs, and dialogs; their visual values must resolve through the theme-parity layer.

## Verification

- Add visual/behavior assertions for light and dark desktop and mobile Studio shells.
- Preserve all existing accessibility names and functional tests.
- Run unit, lint, type, theme-manifest, build, cross-browser Playwright, and visual snapshot verification before merge.

## Non-goals

- No backend, cloud draft, authentication, content-model, ZIP, preview-document, or Hugo-theme source changes.
