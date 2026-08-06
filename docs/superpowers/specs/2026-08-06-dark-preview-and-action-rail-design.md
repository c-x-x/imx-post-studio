# Dark Preview and Action Rail Design

## Goal

Improve the dark reading experience and make the editor workspace more balanced without changing article data, export formats, or the pinned IMX theme snapshot.

## Scope

This change has three connected parts:

1. Make article preview use a readable warm-charcoal dark palette and one seamless page background.
2. Make the application theme the single source of truth for both Studio and preview.
3. Move article actions into a collapsible right rail on desktop, symmetric with the existing settings rail.

## Preview appearance

The dark preview uses the approved warm IMX palette:

- page background: `#151513`
- primary text and headings: `#f5f0e8`
- body text: `#e3dcd2`
- secondary text and quotations: `#d8d0c5`
- metadata: `#b7aea2`
- table of contents links: `#c8bfb3`, without the current excessive opacity reduction
- accent: `#d8b98a`
- quote and code surfaces: approximately `#22211e` and `#201f1c`

The light preview keeps the current warm paper character. In both modes, the preview shell, viewport, and iframe document share the same background. The article iframe no longer appears as a separate card: remove its contrasting background block, border, corner radius, and shadow.

Studio-owned preview overrides load after the pinned IMX preview stylesheet. The generated theme snapshot remains untouched, so theme integrity checks continue to represent the upstream snapshot accurately.

## Preview Dock

The preview toolbar adopts the same IMX liquid-Dock language as the main application:

- Back, reading statistics, theme controls, and device controls remain easy to locate.
- Related controls are visually fused into translucent rounded Dock groups.
- Active controls use the same sliding highlight and transition language as the main navigation.
- Dock surfaces adapt to light and dark mode instead of retaining hard-coded light translucent colors.
- The Dock floats over the unified page background; no full-width toolbar background block is introduced.

On narrow screens, controls may wrap or compact, but all actions remain directly available and keyboard reachable.

## Theme synchronization

`App` remains the sole owner of the `light | dark` theme value.

- Opening preview inherits the current Studio theme.
- Changing theme from the preview Dock updates the global Studio theme immediately.
- Closing preview keeps the selected theme.
- The existing theme preference storage persists the selection across reloads.
- The preview iframe receives the same theme value as its surrounding preview shell.

`PreviewFrame` therefore becomes controlled through a theme value and change callback rather than keeping an independent local theme state.

## Desktop editor layout

The desktop workspace becomes:

`settings rail | settings toggle | editor | actions toggle | actions rail`

The right action rail contains “新建文章” and “保存到草稿库” in a vertical group. It is expanded by default and can be independently collapsed. Its open/closed preference is persisted in local storage, matching the behavior of the left settings rail.

The two edge toggles use mirrored placement and matching visual treatment. Both expose `aria-controls`, `aria-expanded`, and explicit labels. Collapsing either rail gives its space to the editor; collapsing both creates the maximum immersive writing area.

On mobile, the right rail does not become an off-canvas panel. The two actions remain visible in the existing compact horizontal arrangement, and the desktop rail toggle is hidden.

## Behavior boundaries

This change does not alter:

- new-article confirmation and discard behavior
- draft saving, recovery, or ZIP import/export
- Markdown rendering or article front matter
- the source IMX theme repository
- the generated pinned-theme manifest

## Accessibility

- Dark preview text and muted metadata must remain clearly readable against the approved background.
- TOC links must not combine a muted color with low opacity.
- All Dock and rail controls retain visible focus states, accessible labels, and correct pressed/expanded state.
- Theme and device selection must not rely on color alone.
- Reduced-motion preferences disable or shorten sliding and blur transitions where appropriate.

## Verification

Implementation is accepted when all of the following pass:

1. Unit/component tests prove `PreviewFrame` receives the global theme and emits theme changes rather than owning a separate preference.
2. Workspace tests prove the right rail is expanded initially, collapses and expands independently, and restores its stored preference.
3. End-to-end tests prove preview inherits the app theme, preview theme changes update the app and iframe, and the choice survives closing and reloading.
4. End-to-end layout tests prove desktop editor width grows when the right rail collapses and mobile actions remain visible.
5. Computed-style or equivalent assertions cover readable dark body, metadata, and TOC colors.
6. Chromium desktop and mobile visual baselines are reviewed for light and dark preview, unified backgrounds, preview Dock fusion, and the right action rail.
7. Existing unit, theme-integrity, build, and E2E suites remain green.

## Implementation direction

Use a small Studio-owned override stylesheet for preview-specific contrast fixes, controlled theme props for `PreviewFrame`, and a right-rail preference helper parallel to the existing sidebar preference helper. Keep the implementation incremental and reuse the existing Dock, button, persistence, and responsive patterns wherever possible.
