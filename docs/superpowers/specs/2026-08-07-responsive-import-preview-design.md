# Responsive Import And Preview Design

## Goal

Keep ZIP confirmation dialogs and the full-screen article preview usable at every supported viewport size without clipped modal content or horizontal scrolling.

## Design

- Render every `AccessibleDialog` backdrop through a React portal attached to `document.body`. This removes dialogs from sticky, transformed, collapsed, or overflow-constrained workspace ancestors while preserving the existing focus trap and focus restoration contract.
- Constrain standard dialogs to the visual viewport with safe inline padding, a scrollable dialog body, wrapping action buttons, and compact spacing for short or narrow viewports.
- Make preview iframe width container-relative: desktop preview uses `min(1180px, 100%)`; mobile preview uses `min(390px, 100%)`. The preview shell clips horizontal overflow because scrolling belongs to the iframe document, not the full-screen canvas.
- Switch the preview Dock to its compact arrangement before its controls collide, while retaining the existing mobile control sizes below 720px.

## Verification

- Component tests prove dialogs are portaled to `document.body` and preview widths are responsive CSS expressions.
- Playwright tests cover constrained ZIP import dialogs and preview widths at 760, 900, 1024, and 1180 pixels.
- Existing unit, build, theme-manifest, accessibility, security, and three-browser E2E suites remain green.

